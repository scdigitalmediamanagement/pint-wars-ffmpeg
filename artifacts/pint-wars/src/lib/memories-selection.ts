import type { PintWarActivityEvent } from '@workspace/api-client-react';

export type MemoriesPhotoCandidate = {
  pintLogId: string;
  userId: string;
  playerName: string;
  pubName: string | null;
  occurredAt: string;
};

function randomIndex(random: () => number, maxExclusive: number) {
  const value = Math.min(Math.max(random(), 0), 0.9999999999);
  return Math.floor(value * maxExclusive);
}

/**
 * Returns unique proof photos in randomized order, balancing repeated picks
 * across players first and pubs second. Keep the full ordered list so the
 * player can try fallback photos when selected Storage objects are unavailable.
 */
export function orderMemoriesPhotos(
  events: PintWarActivityEvent[],
  random: () => number = Math.random,
): MemoriesPhotoCandidate[] {
  const seenPhotoIds = new Set<string>();
  const candidates: MemoriesPhotoCandidate[] = [];

  for (const event of events) {
    const pintLogId = event.photoPintLogId;
    if (event.type !== 'pint_logged' || !pintLogId || seenPhotoIds.has(pintLogId)) {
      continue;
    }
    seenPhotoIds.add(pintLogId);
    candidates.push({
      pintLogId,
      userId: event.userId,
      playerName: event.playerName,
      pubName: event.pubName,
      occurredAt: event.occurredAt,
    });
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(random, index + 1);
    [candidates[index], candidates[swapIndex]] = [
      candidates[swapIndex],
      candidates[index],
    ];
  }

  const ordered: MemoriesPhotoCandidate[] = [];
  const playerCounts = new Map<string, number>();
  const pubCounts = new Map<string, number>();
  const remaining = [...candidates];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDiversityScore = Number.POSITIVE_INFINITY;
    let bestTieBreaker = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const playerCount = playerCounts.get(candidate.userId) ?? 0;
      const pubCount = candidate.pubName ? pubCounts.get(candidate.pubName) ?? 0 : 0;
      const diversityScore = playerCount * 100 + pubCount;
      const tieBreaker = random();

      if (
        diversityScore < bestDiversityScore ||
        (diversityScore === bestDiversityScore && tieBreaker > bestTieBreaker)
      ) {
        bestIndex = index;
        bestDiversityScore = diversityScore;
        bestTieBreaker = tieBreaker;
      }
    }

    const [candidate] = remaining.splice(bestIndex, 1);
    if (!candidate) continue;
    ordered.push(candidate);
    playerCounts.set(candidate.userId, (playerCounts.get(candidate.userId) ?? 0) + 1);
    if (candidate.pubName) {
      pubCounts.set(candidate.pubName, (pubCounts.get(candidate.pubName) ?? 0) + 1);
    }
  }

  return ordered;
}