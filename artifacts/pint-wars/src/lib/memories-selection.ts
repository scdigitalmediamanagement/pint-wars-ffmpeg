import type { PintWarActivityEvent } from '@workspace/api-client-react';

const MIN_TARGET_PHOTOS = 16;
const MAX_TARGET_PHOTOS = 20;
const TARGET_PHOTO_RATIO = 0.8;
const TIME_COVERAGE_BINS = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type MemoriesPhotoCandidate = {
  pintLogId: string;
  userId: string;
  playerName: string;
  pubName: string | null;
  occurredAt: string;
};

type WarTimeRange = {
  startMs: number;
  endMs: number;
  durationMs: number;
  finalPortionStartMs: number;
};

type TimedCandidate = {
  photo: MemoriesPhotoCandidate;
  timestampMs: number | null;
  timeBin: number | null;
};

type SelectionCounts = {
  players: Map<string, number>;
  pubs: Map<string, number>;
  timeBins: Map<number, number>;
};

function normalizedRandom(random: () => number) {
  const value = random();
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(Math.max(value, 0), 0.9999999999);
}

function randomIndex(random: () => number, maxExclusive: number) {
  return Math.floor(normalizedRandom(random) * maxExclusive);
}

function parseTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getWarTimeRange(events: PintWarActivityEvent[]): WarTimeRange | null {
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    const timestamp = parseTimestamp(event.occurredAt);
    if (timestamp === null) continue;
    startMs = Math.min(startMs, timestamp);
    endMs = Math.max(endMs, timestamp);
  }

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  const durationMs = Math.max(0, endMs - startMs);
  const desiredFinalWindowMs = durationMs >= DAY_MS
    ? Math.min(12 * HOUR_MS, Math.max(6 * HOUR_MS, durationMs * 0.2))
    : Math.min(6 * HOUR_MS, Math.max(45 * 60 * 1000, durationMs * 0.4));
  const finalWindowMs = Math.min(durationMs, desiredFinalWindowMs);

  return {
    startMs,
    endMs,
    durationMs,
    finalPortionStartMs: endMs - finalWindowMs,
  };
}

function timeBinFor(timestampMs: number | null, timeRange: WarTimeRange | null) {
  if (timestampMs === null || !timeRange || timeRange.durationMs <= 0) return null;
  const progress = Math.min(
    Math.max((timestampMs - timeRange.startMs) / timeRange.durationMs, 0),
    0.9999999999,
  );
  return Math.floor(progress * TIME_COVERAGE_BINS);
}

export function memoriesPhotoTargetCount(availablePhotoCount: number) {
  const count = Number.isFinite(availablePhotoCount)
    ? Math.max(0, Math.floor(availablePhotoCount))
    : 0;
  if (count <= MAX_TARGET_PHOTOS) return count;
  return Math.min(
    MAX_TARGET_PHOTOS,
    Math.max(MIN_TARGET_PHOTOS, Math.round(count * TARGET_PHOTO_RATIO)),
  );
}

function shuffle<T>(items: T[], random: () => number) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(random, index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createCounts(): SelectionCounts {
  return {
    players: new Map(),
    pubs: new Map(),
    timeBins: new Map(),
  };
}

function selectionWeight(candidate: TimedCandidate, counts: SelectionCounts, timeRange: WarTimeRange | null) {
  const playerCount = counts.players.get(candidate.photo.userId) ?? 0;
  const pubCount = candidate.photo.pubName
    ? counts.pubs.get(candidate.photo.pubName) ?? 0
    : 0;
  const timeBinCount = candidate.timeBin === null
    ? 0
    : counts.timeBins.get(candidate.timeBin) ?? 0;
  const isInFinalPortion = timeRange !== null
    && timeRange.durationMs > 0
    && candidate.timestampMs !== null
    && candidate.timestampMs >= timeRange.finalPortionStartMs;
  const endOfWarWeight = isInFinalPortion ? 3 : 1;
  const playerVarietyWeight = 1 / (1 + playerCount * 0.75);
  const pubVarietyWeight = 1 / (1 + pubCount * 0.5);
  const timeCoverageWeight = 1 / (1 + timeBinCount * 0.65);

  return endOfWarWeight * playerVarietyWeight * pubVarietyWeight * timeCoverageWeight;
}

function weightedIndex(
  candidates: TimedCandidate[],
  getWeight: (candidate: TimedCandidate) => number,
  random: () => number,
) {
  const weights = candidates.map(getWeight);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight <= 0 || !Number.isFinite(totalWeight)) {
    return randomIndex(random, candidates.length);
  }

  let cursor = normalizedRandom(random) * totalWeight;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return index;
  }
  return weights.length - 1;
}

function recordSelection(candidate: TimedCandidate, counts: SelectionCounts) {
  const { photo, timeBin } = candidate;
  counts.players.set(photo.userId, (counts.players.get(photo.userId) ?? 0) + 1);
  if (photo.pubName) {
    counts.pubs.set(photo.pubName, (counts.pubs.get(photo.pubName) ?? 0) + 1);
  }
  if (timeBin !== null) {
    counts.timeBins.set(timeBin, (counts.timeBins.get(timeBin) ?? 0) + 1);
  }
}

function chooseCandidate(
  pool: TimedCandidate[],
  remaining: TimedCandidate[],
  selected: TimedCandidate[],
  counts: SelectionCounts,
  timeRange: WarTimeRange | null,
  random: () => number,
) {
  if (pool.length === 0) return;
  const index = weightedIndex(
    pool,
    (candidate) => selectionWeight(candidate, counts, timeRange),
    random,
  );
  const [candidate] = pool.splice(index, 1);
  if (!candidate) return;

  const remainingIndex = remaining.indexOf(candidate);
  if (remainingIndex >= 0) remaining.splice(remainingIndex, 1);
  selected.push(candidate);
  recordSelection(candidate, counts);
}

function diverseRandomOrder(
  candidates: TimedCandidate[],
  random: () => number,
  previous: MemoriesPhotoCandidate | null = null,
) {
  const remaining = shuffle(candidates, random);
  const ordered: MemoriesPhotoCandidate[] = [];
  const counts = createCounts();
  let last = previous;
  let secondLast: MemoriesPhotoCandidate | null = null;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestTieBreaker = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      let score = (counts.players.get(candidate.photo.userId) ?? 0) * 100
        + (candidate.photo.pubName ? counts.pubs.get(candidate.photo.pubName) ?? 0 : 0) * 10;

      if (last?.userId === candidate.photo.userId) score += 10_000;
      if (last?.pubName && last.pubName === candidate.photo.pubName) score += 5_000;
      if (secondLast?.userId === candidate.photo.userId) score += 500;
      if (secondLast?.pubName && secondLast.pubName === candidate.photo.pubName) score += 250;

      const tieBreaker = normalizedRandom(random);
      if (score < bestScore || (score === bestScore && tieBreaker > bestTieBreaker)) {
        bestIndex = index;
        bestScore = score;
        bestTieBreaker = tieBreaker;
      }
    }

    const [candidate] = remaining.splice(bestIndex, 1);
    if (!candidate) continue;
    ordered.push(candidate.photo);
    counts.players.set(candidate.photo.userId, (counts.players.get(candidate.photo.userId) ?? 0) + 1);
    if (candidate.photo.pubName) {
      counts.pubs.set(
        candidate.photo.pubName,
        (counts.pubs.get(candidate.photo.pubName) ?? 0) + 1,
      );
    }
    secondLast = last;
    last = candidate.photo;
  }

  return ordered;
}

/**
 * Places a randomized, time-weighted subset first, then keeps the remaining
 * varied candidates available as fallbacks if a private photo cannot load.
 */
export function orderMemoriesPhotos(
  events: PintWarActivityEvent[],
  random: () => number = Math.random,
): MemoriesPhotoCandidate[] {
  const seenPhotoIds = new Set<string>();
  const candidates: TimedCandidate[] = [];
  const timeRange = getWarTimeRange(events);

  for (const event of events) {
    const pintLogId = event.photoPintLogId;
    if (event.type !== 'pint_logged' || !pintLogId || seenPhotoIds.has(pintLogId)) {
      continue;
    }
    seenPhotoIds.add(pintLogId);
    const photo: MemoriesPhotoCandidate = {
      pintLogId,
      userId: event.userId,
      playerName: event.playerName,
      pubName: event.pubName,
      occurredAt: event.occurredAt,
    };
    const timestampMs = parseTimestamp(event.occurredAt);
    candidates.push({
      photo,
      timestampMs,
      timeBin: timeBinFor(timestampMs, timeRange),
    });
  }

  const targetCount = memoriesPhotoTargetCount(candidates.length);
  if (targetCount === 0) return [];

  const remaining = [...candidates];
  const selected: TimedCandidate[] = [];
  const counts = createCounts();
  const occupiedTimeBins = [...new Set(
    candidates
      .map((candidate) => candidate.timeBin)
      .filter((bin): bin is number => bin !== null),
  )].sort((left, right) => left - right);

  // Reserve an early pick from every available part of the war before filling
  // the rest of the subset, so late weighting does not erase earlier coverage.
  for (const timeBin of occupiedTimeBins) {
    if (selected.length >= targetCount) break;
    const pool = remaining.filter((candidate) => candidate.timeBin === timeBin);
    chooseCandidate(pool, remaining, selected, counts, timeRange, random);
  }

  while (selected.length < targetCount && remaining.length > 0) {
    chooseCandidate(remaining, remaining, selected, counts, timeRange, random);
  }

  const selectedIds = new Set(selected.map((candidate) => candidate.photo.pintLogId));
  const selectedOrder = diverseRandomOrder(selected, random);
  const selectedLast = selectedOrder[selectedOrder.length - 1] ?? null;
  const fallbackOrder = diverseRandomOrder(
    candidates.filter((candidate) => !selectedIds.has(candidate.photo.pintLogId)),
    random,
    selectedLast,
  );

  return [...selectedOrder, ...fallbackOrder];
}