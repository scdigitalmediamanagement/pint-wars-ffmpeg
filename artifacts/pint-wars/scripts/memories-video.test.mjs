import assert from 'node:assert/strict';
import test from 'node:test';
import { memoriesFramePlan, prepareMemoriesFilm } from '../src/lib/memories-video-pipeline.ts';
import { runMemoriesAction } from '../src/lib/memories-actions.ts';

const photos = Array.from({ length: 24 }, (_, index) => ({
  pintLogId: `photo-${index}`, userId: `player-${index % 4}`, playerName: `Player ${index % 4}`,
  pubName: `Pub ${index % 3}`, occurredAt: '2026-10-01T12:00:00Z',
}));
const metadata = {
  leagueName: 'Test fixture war', completedLabel: 'Completed', winnerNames: 'Player 1',
  winnerPoints: 10, winnerCount: 1, totalPints: 24, playerCount: 4, pubsVisited: 3,
};
function fixture(overrides = {}) {
  const released = [];
  const staged = [];
  const rendered = [];
  return {
    released, staged, rendered,
    dependencies: {
      beginJob: async () => 'private-job',
      stagePhoto: async (id, photo) => { staged.push(photo.pintLogId); return `file:///private/${id}/${photo.pintLogId}.jpg`; },
      render: async (id, paths, summary, progress) => {
        rendered.push({ id, paths, summary });
        progress(1);
        return { uri: 'file:///private/private-job/Pint-War-Memories.mp4', duration: 30, width: 720, height: 1280 };
      },
      releaseJob: (id) => released.push(id),
      ...overrides,
    },
  };
}
function prepare(f, order = photos, target = 20, controller = new AbortController()) {
  return prepareMemoriesFilm(order, target, metadata, f.dependencies, controller.signal, () => {});
}
test('every photo count produces exactly 30 seconds with a final 3-second results card', () => {
  for (let count = 1; count <= 20; count += 1) {
    const plan = memoriesFramePlan(count);
    assert.equal(plan[0].startTime, 2);
    assert.equal(plan.reduce((total, item) => total + item.frames, 0) + 60 + 90, 900);
    assert.equal(plan.at(-1).startTime + plan.at(-1).frames / 30, 27);
  }
  for (const count of [0, 21, -1, 2.5, NaN]) assert.throws(() => memoriesFramePlan(count));
});
test('the existing selected order and actual metadata reach FFmpeg as local file paths', async () => {
  const f = fixture();
  const film = await prepare(f);
  assert.deepEqual(f.staged, photos.slice(0, 20).map((photo) => photo.pintLogId));
  assert.deepEqual(f.rendered[0].summary, metadata);
  assert.equal(film.moments.length, 20);
  assert.equal(film.moments[0].startTime, 2);
  assert.ok(f.rendered[0].paths.every((path) => path.startsWith('file://')));
  assert.deepEqual(f.released, []); // Caller owns the successful player/share lifetime.
});
test('404/unsupported photographs use the selection fallback tail without duplicates', async () => {
  const staged = [];
  const f = fixture({ stagePhoto: async (id, photo) => {
    staged.push(photo.pintLogId);
    if (photo.pintLogId === 'photo-0') throw Object.assign(new Error('Unavailable'), { status: 404 });
    if (photo.pintLogId === 'photo-1') throw Object.assign(new Error('Decode failed'), { code: 'PHOTO_UNUSABLE' });
    return `file:///private/${id}/${photo.pintLogId}.jpg`;
  } });
  const film = await prepare(f, [photos[0], photos[0], ...photos.slice(1)]);
  assert.equal(film.moments.length, 20);
  assert.equal(film.skippedCount, 2);
  assert.equal(new Set(staged).size, staged.length);
  assert.equal(film.moments.at(-1).pintLogId, 'photo-21');
});
for (const status of [401, 403, 502]) {
  test(`${status} is not hidden as a missing photo; private files get cleaned up`, async () => {
    const f = fixture({ stagePhoto: async () => { throw Object.assign(new Error('Private stream failed'), { status }); } });
    await assert.rejects(prepare(f), /Private stream failed/);
    assert.deepEqual(f.released, ['private-job']);
    assert.equal(f.rendered.length, 0);
  });
}
test('network and encoder failures release the job', async () => {
  for (const overrides of [
    { stagePhoto: async () => { throw new Error('Network failed'); } },
    { render: async () => { throw new Error('Encoder failed'); } },
  ]) {
    const f = fixture(overrides);
    await assert.rejects(prepare(f), /failed/);
    assert.deepEqual(f.released, ['private-job']);
  }
});
test('empty and wholly unavailable wars cannot fabricate a video', async () => {
  const f = fixture();
  await assert.rejects(prepare(f, [], 0), /No proof photos/);
  assert.deepEqual(f.released, []);
  const missing = fixture({ stagePhoto: async () => { throw Object.assign(new Error('Missing'), { status: 404 }); } });
  await assert.rejects(prepare(missing), /No usable proof photos/);
  assert.deepEqual(missing.released, ['private-job']);
});
test('cancellation before staging and during rendering never publishes a stale video', async () => {
  const early = new AbortController();
  early.abort();
  const f = fixture();
  await assert.rejects(prepare(f, photos, 20, early), { name: 'AbortError' });
  assert.deepEqual(f.staged, []);
  const late = new AbortController();
  const next = fixture({ render: async () => {
    late.abort();
    return { uri: 'file:///private/film.mp4', duration: 30, width: 720, height: 1280 };
  } });
  await assert.rejects(prepare(next, photos, 20, late), { name: 'AbortError' });
  assert.ok(next.released.length > 0);
});
test('non-local source/output paths and an invalid MP4 duration are rejected and cleaned', async () => {
  for (const overrides of [
    { stagePhoto: async () => 'https://private.example/proof.jpg' },
    { render: async () => ({ uri: 'https://private.example/film.mp4', duration: 30 }) },
    { render: async () => ({ uri: 'file:///private/film.mp4', duration: 0 }) },
    { render: async () => ({ uri: 'file:///private/film.jpg', duration: 30 }) },
  ]) {
    const f = fixture(overrides);
    await assert.rejects(prepare(f));
    assert.deepEqual(f.released, ['private-job']);
  }
});
test('save only reports success after native Photos completion', async () => {
  let received;
  const result = await runMemoriesAction('save', 'private-job', {
    saveVideoAsync: async (id) => { received = id; return 'saved'; },
  });
  assert.equal(received, 'private-job');
  assert.equal(result.failed, false);
  assert.match(result.notice, /saved to Photos/);
});
test('denied Photos permission offers settings; save failure remains retryable', async () => {
  const denied = await runMemoriesAction('save', 'private-job', {
    saveVideoAsync: async () => { throw Object.assign(new Error('Allow Photos in Settings'), { code: 'PHOTOS_PERMISSION_DENIED' }); },
  });
  assert.equal(denied.failed, true);
  assert.equal(denied.photosDenied, true);
  const failed = await runMemoriesAction('save', 'private-job', {
    saveVideoAsync: async () => { throw new Error('Insufficient storage'); },
  });
  assert.equal(failed.failed, true);
  assert.equal(failed.photosDenied, false);
  assert.equal(failed.notice, 'Insufficient storage');
});
test('share completion, dismissal and errors are distinct and use the generated job', async () => {
  for (const completed of [true, false]) {
    const result = await runMemoriesAction('share', 'private-job', {
      shareVideoAsync: async (id) => { assert.equal(id, 'private-job'); return { completed }; },
    });
    assert.equal(result.failed, false);
    assert.equal(result.notice.length > 0, completed);
  }
  const failed = await runMemoriesAction('share', 'private-job', {
    shareVideoAsync: async () => { throw new Error('Share failed'); },
  });
  assert.equal(failed.failed, true);
  assert.equal(failed.photosDenied, false);
});
