import assert from 'node:assert/strict';
import test from 'node:test';
import {
  memoriesPhotoTargetCount,
  orderMemoriesPhotos,
} from '../src/lib/memories-selection.ts';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function photoEvents({ count, start, duration }) {
  return Array.from({ length: count }, (_, index) => ({
    id: `photo-event-${index}`,
    type: 'pint_logged',
    userId: `player-${index % 7}`,
    playerName: `Player ${index % 7}`,
    pubName: `Pub ${index % 5}`,
    photoPintLogId: `photo-${index}`,
    occurredAt: new Date(start + Math.round((duration * index) / (count - 1))).toISOString(),
  }));
}

const fiveDayStart = Date.parse('2026-09-10T18:00:00Z');
const fiveDayDuration = 5 * 24 * 60 * 60 * 1000;
const fiveDayPhotos = photoEvents({
  count: 60,
  start: fiveDayStart,
  duration: fiveDayDuration,
});
const fiveDayEvents = [
  ...fiveDayPhotos,
  { ...fiveDayPhotos[0], occurredAt: new Date(fiveDayStart + fiveDayDuration / 2).toISOString() },
  {
    ...fiveDayPhotos[0],
    id: 'final-non-photo-event',
    type: 'pub_review',
    photoPintLogId: null,
    occurredAt: new Date(fiveDayStart + fiveDayDuration).toISOString(),
  },
];

test('uses all available photos below 16 and selects a 16–20 photo target above 20', () => {
  assert.deepEqual(
    [[7, 7], [12, 12], [17, 17], [21, 17], [22, 18], [24, 19], [25, 20], [40, 20]]
      .map(([available, expected]) => [available, memoriesPhotoTargetCount(available)]),
    [[7, 7], [12, 12], [17, 17], [21, 17], [22, 18], [24, 19], [25, 20], [40, 20]],
  );

  const smallPhotos = photoEvents({
    count: 7,
    start: fiveDayStart,
    duration: fiveDayDuration,
  });
  const smallOrder = orderMemoriesPhotos(smallPhotos, seededRandom(1));
  assert.equal(smallOrder.length, 7);
  assert.deepEqual(
    new Set(smallOrder.map((photo) => photo.pintLogId)),
    new Set(smallPhotos.map((photo) => photo.photoPintLogId)),
  );
});

test('deduplicates, covers the war, overrepresents its ending, and randomizes diverse playback', () => {
  let lateWindowSelections = 0;
  let adjacentPlayerRepeats = 0;
  let adjacentPubRepeats = 0;
  let priorPrefix = '';

  for (let seed = 1; seed <= 100; seed += 1) {
    const ordered = orderMemoriesPhotos(fiveDayEvents, seededRandom(seed));
    const photoIds = ordered.map((photo) => photo.pintLogId);
    const selected = ordered.slice(0, memoriesPhotoTargetCount(ordered.length));

    assert.equal(ordered.length, 60, 'duplicate photo IDs should be removed');
    assert.equal(new Set(photoIds).size, 60, 'selected and fallback IDs should be unique');
    assert.equal(selected.length, 20);
    assert.equal(
      new Set(photoIds).size,
      new Set(fiveDayPhotos.map((photo) => photo.photoPintLogId)).size,
      'the remaining unique photos should stay available as fallbacks',
    );

    const timeBins = new Set(selected.map((photo) => {
      const progress = (Date.parse(photo.occurredAt) - fiveDayStart) / fiveDayDuration;
      return Math.min(4, Math.floor(progress * 5));
    }));
    assert.equal(timeBins.size, 5, 'the selected subset should span every populated time bin');

    const timestamps = selected.map((photo) => Date.parse(photo.occurredAt));
    assert.ok(
      timestamps.some((timestamp, index) => index > 0 && timestamp < timestamps[index - 1]),
      'playback should not be chronological',
    );

    const prefix = selected.map((photo) => photo.pintLogId).join(',');
    assert.notEqual(prefix, priorPrefix, 'shuffle/replay should vary the selected sequence');
    priorPrefix = prefix;

    for (let index = 0; index < selected.length; index += 1) {
      const photo = selected[index];
      if (Date.parse(photo.occurredAt) >= fiveDayStart + fiveDayDuration - 12 * 60 * 60 * 1000) {
        lateWindowSelections += 1;
      }
      if (index > 0 && photo.userId === selected[index - 1].userId) {
        adjacentPlayerRepeats += 1;
      }
      if (index > 0 && photo.pubName === selected[index - 1].pubName) {
        adjacentPubRepeats += 1;
      }
    }
  }

  const selectedCount = 100 * 20;
  assert.ok(lateWindowSelections / selectedCount > 0.18, 'the final 10% should be overrepresented');
  assert.ok(adjacentPlayerRepeats / (100 * 19) < 0.05, 'player repeats should remain uncommon');
  assert.ok(adjacentPubRepeats / (100 * 19) < 0.05, 'pub repeats should remain uncommon');
});

test('gives a short war a strong final-portion preference', () => {
  const duration = 12 * 60 * 60 * 1000;
  const start = Date.parse('2026-09-25T12:00:00Z');
  const events = photoEvents({ count: 60, start, duration });
  let lateSelections = 0;

  for (let seed = 1; seed <= 50; seed += 1) {
    const selected = orderMemoriesPhotos(events, seededRandom(seed))
      .slice(0, memoriesPhotoTargetCount(events.length));
    for (const photo of selected) {
      if (Date.parse(photo.occurredAt) >= start + duration * 0.6) lateSelections += 1;
    }
  }

  assert.ok(lateSelections / (50 * 20) > 0.48, 'the final 40% should be strongly represented');
});