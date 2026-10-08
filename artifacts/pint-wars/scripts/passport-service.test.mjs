import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the actual service with injected transports, without connecting to
// Supabase or requiring a React Native runtime.
const source = fs.readFileSync(new URL('../src/lib/passport-service.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source.replace(/^import .+;\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^export /gm, '');
const load = new Function('getSupabase', 'expoFetch', `${js}\nreturn logPassportVisit;`);
const userId = '11111111-1111-4111-8111-111111111111';
const visit = { visit_id: 'saved-visit', visited_at: '2026-10-08T12:00:00Z' };
const input = {
  pubProvider: 'google_places', pubPlaceId: 'test-pub', pubName: 'Test Pub',
  pubAddress: 'London', latitude: 51.5, longitude: -0.1,
  photoUri: 'file:///single-camera-photo.jpg', mimeType: 'image/jpeg',
};

function harness(overrides = {}) {
  const calls = { uploads: [], rpc: [], removals: [] };
  const storage = {
    upload: async (...args) => { calls.uploads.push(args); return { error: overrides.uploadError ?? null }; },
    remove: async (paths) => { calls.removals.push(paths); return { error: overrides.cleanupError ?? null }; },
  };
  const lookup = {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return overrides.recovery ?? { data: null, error: null }; },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: overrides.signedOut ? null : { id: userId } }, error: null }) },
    storage: { from(bucket) { assert.equal(bucket, 'pint-proofs'); return storage; } },
    from(table) { assert.equal(table, 'pub_visits'); return lookup; },
    rpc: async (...args) => {
      calls.rpc.push(args);
      if (overrides.thrown) throw new Error('Network interrupted');
      return overrides.rpcResult ?? { data: [visit], error: null };
    },
  };
  const fetchPhoto = async (uri) => {
    assert.equal(uri, input.photoUri);
    return { ok: true, arrayBuffer: async () => new Uint8Array(overrides.empty ? [] : [1, 2, 3]).buffer };
  };
  return { log: load(() => client, fetchPhoto), calls };
}

test('uploads one private photo and saves through only the unscored Passport RPC', async () => {
  const { log, calls } = harness();
  assert.deepEqual(await log(input), visit);
  assert.equal(calls.uploads.length, 1);
  const [path, bytes, options] = calls.uploads[0];
  assert.match(path, new RegExp(`^${userId}/passport/[^/]+\\.jpg$`));
  assert.equal(bytes.byteLength, 3);
  assert.equal(options.upsert, false);
  assert.equal(calls.rpc[0][0], 'log_passport_visit');
  assert.equal(calls.rpc[0][1].p_photo_path, path);
  assert.equal(calls.rpc[0][1].p_pub_place_id, input.pubPlaceId);
  assert.equal('p_league_id' in calls.rpc[0][1], false);
  assert.equal(calls.removals.length, 0);
});

test('requires one nonempty photo, valid pub coordinates and a signed-in owner', async () => {
  for (const patch of [{ photoUri: '' }, { pubPlaceId: '' }, { latitude: NaN }, { longitude: 181 }]) {
    const { log, calls } = harness();
    await assert.rejects(log({ ...input, ...patch }));
    assert.equal(calls.uploads.length, 0);
  }
  await assert.rejects(harness({ signedOut: true }).log(input), /Sign in/);
  const empty = harness({ empty: true });
  await assert.rejects(empty.log(input), /empty/);
  assert.equal(empty.calls.uploads.length, 0);
});

test('upload failure never creates a visit', async () => {
  const { log, calls } = harness({ uploadError: { message: 'upload denied' } });
  await assert.rejects(log(input), /upload denied/);
  assert.equal(calls.rpc.length, 0);
});

test('confirmed database rejection cleans up only its unsaved photo', async () => {
  const { log, calls } = harness({ rpcResult: { data: null, error: { code: 'P0001', message: 'Pub rejected' } } });
  await assert.rejects(log(input), /Pub rejected/);
  assert.deepEqual(calls.removals, [[calls.uploads[0][0]]]);
});

test('a lost response to a committed visit is recovered without deleting its photo', async () => {
  const { log, calls } = harness({
    rpcResult: { data: null, error: { code: '', message: 'Fetch failed' } },
    recovery: { data: { id: visit.visit_id, visited_at: visit.visited_at }, error: null },
  });
  assert.deepEqual(await log(input), visit);
  assert.equal(calls.removals.length, 0);
});

test('network ambiguity or unavailable reconciliation preserves a potentially saved photo', async () => {
  for (const overrides of [
    { rpcResult: { data: null, error: { code: '', message: 'Timeout' } } },
    { thrown: true },
    { rpcResult: { data: null, error: { code: 'P0001', message: 'Rejected' } }, recovery: { data: null, error: { message: 'Offline' } } },
  ]) {
    const { log, calls } = harness(overrides);
    await assert.rejects(log(input), /Refresh your Passport/);
    assert.equal(calls.removals.length, 0);
  }
});

test('cleanup failure is reported rather than hidden', async () => {
  const { log } = harness({
    rpcResult: { data: null, error: { code: 'P0001', message: 'Rejected' } },
    cleanupError: { message: 'Deletion failed' },
  });
  await assert.rejects(log(input), /could not be removed/);
});

test('camera cancellation and single-photo guard precede saving; review context is unscored', () => {
  const screen = fs.readFileSync(new URL('../app/pub/[placeId].tsx', import.meta.url), 'utf8');
  assert.ok(screen.indexOf('if (photo.canceled) return') < screen.indexOf('await logPassportVisit({'));
  assert.ok(screen.indexOf('photo.assets.length !== 1') < screen.indexOf('await logPassportVisit({'));
  assert.match(screen, /passportVisitSaved \|\| !pintLogId/);
  assert.match(screen, /else if \(passportReview\)[\s\S]*?createPassportPubReview\(input\)/);
});
