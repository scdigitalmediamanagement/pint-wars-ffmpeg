import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPubDiscoveryService,
  isValidNearbyCoordinates,
  locationFailureMessage,
  resolveApiBaseUrl,
} from '../src/lib/pub-discovery-core.ts';

const location = { latitude: 51.5, longitude: -0.12 };
const found = { pubs: [{ placeId: 'pub-1' }], providerConfigured: true };

function makeHarness(request, options = {}) {
  let clock = 1_800_000_000_000;
  const values = new Map();
  const events = [];
  const service = createPubDiscoveryService({
    request,
    storage: {
      async getItem(key) { return values.get(key) ?? null; },
      async setItem(key, value) { values.set(key, value); },
    },
    now: () => clock,
    wait: async () => {},
    makeRequestId: () => 'test-request',
    log: (event) => events.push(event),
  });
  return {
    service,
    events,
    advance(milliseconds) { clock += milliseconds; },
  };
}

test('accepts success and distinguishes a valid empty result', async () => {
  const { service } = makeHarness(async () => found);
  assert.deepEqual(await service.findNearbyPubs(location), {
    ...found,
    isStale: false,
  });
  const empty = makeHarness(async () => ({ pubs: [], providerConfigured: true }));
  const result = await empty.service.findNearbyPubs(location);
  assert.equal(result.pubs.length, 0);
  assert.equal(empty.events.at(-1).category, 'empty_results');
});

test('retries one transient upstream failure, but not authentication or rate limits', async () => {
  let attempts = 0;
  const transient = makeHarness(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('upstream'), { status: 502 });
    return found;
  });
  assert.equal((await transient.service.findNearbyPubs(location)).isStale, false);
  assert.equal(attempts, 2);

  for (const status of [401, 429, 503]) {
    let calls = 0;
    const permanent = makeHarness(async () => {
      calls += 1;
      throw Object.assign(new Error('permanent'), { status });
    });
    await assert.rejects(permanent.service.findNearbyPubs(location));
    assert.equal(calls, 1);
  }
});

test('falls back to nearby saved results after a failed refresh', async () => {
  let fail = false;
  const harness = makeHarness(async () => {
    if (fail) throw Object.assign(new Error('offline'), { status: 502 });
    return found;
  });
  await harness.service.findNearbyPubs(location);
  harness.advance(30_000);
  fail = true;
  const fallback = await harness.service.findNearbyPubs(location, { forceRefresh: true });
  assert.equal(fallback.isStale, true);
  assert.equal(fallback.failureCategory, 'google_places_failure');
  assert.deepEqual(fallback.pubs, found.pubs);
});

test('does not invent fallback data when storage is empty or the location is too far away', async () => {
  let fail = false;
  const harness = makeHarness(async () => {
    if (fail) throw Object.assign(new Error('offline'), { status: 502 });
    return found;
  });
  await harness.service.findNearbyPubs(location);
  harness.advance(30_000);
  fail = true;
  await assert.rejects(
    harness.service.findNearbyPubs({ latitude: 40.7, longitude: -74 }, { forceRefresh: true }),
  );
});

test('deduplicates simultaneous equivalent requests', async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const harness = makeHarness(async () => {
    calls += 1;
    await pending;
    return found;
  });
  const first = harness.service.findNearbyPubs(location, { forceRefresh: true });
  const second = harness.service.findNearbyPubs(location, { forceRefresh: true });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a.pubs, b.pubs);
});

test('rejects invalid coordinates and validates the configured API origin', async () => {
  assert.equal(isValidNearbyCoordinates(location), true);
  assert.equal(isValidNearbyCoordinates({ latitude: 91, longitude: 0 }), false);
  assert.equal(resolveApiBaseUrl('api.example.test'), 'https://api.example.test');
  assert.equal(resolveApiBaseUrl('http://api.example.test'), null);
  assert.equal(resolveApiBaseUrl('https://api.example.test/path'), null);
  assert.equal(resolveApiBaseUrl(undefined), null);
  assert.equal(
    locationFailureMessage('permission-denied'),
    'Location is off. You can still log without a pub.',
  );
  assert.match(locationFailureMessage('unavailable'), /could not get your location/i);
});
