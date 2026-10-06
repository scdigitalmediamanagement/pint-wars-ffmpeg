import type { MemoriesPhotoCandidate } from './memories-selection';

export type MemoriesMetadata = {
  leagueName: string;
  completedLabel: string;
  winnerNames: string;
  winnerPoints: number;
  winnerCount: number;
  totalPints: number;
  playerCount: number;
  pubsVisited: number;
};
export type MemoriesVideo = { uri: string; duration: number; width: number; height: number };
export type MemoriesMoment = MemoriesPhotoCandidate & { uri: string; startTime: number };
export type MemoriesFilm = MemoriesVideo & { jobId: string; moments: MemoriesMoment[]; skippedCount: number };
export type MemoriesProgress = { progress: number; label: string };
export type MemoriesPipelineDependencies = {
  beginJob: () => Promise<string>;
  stagePhoto: (jobId: string, photo: MemoriesPhotoCandidate, signal: AbortSignal) => Promise<string>;
  render: (jobId: string, paths: string[], metadata: MemoriesMetadata, onProgress: (fraction: number) => void) => Promise<MemoriesVideo>;
  releaseJob: (jobId: string) => void;
};

export function memoriesFramePlan(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Memories needs 1–20 selected photos.');
  const photoFrames = Array.from({ length: count }, (_, index) => Math.floor(750 / count) + (index < 750 % count ? 1 : 0));
  let frame = 60;
  return photoFrames.map((frames) => {
    const startTime = frame / 30;
    frame += frames;
    return { frames, startTime };
  });
}

function checkCancelled(signal: AbortSignal) {
  if (signal.aborted) {
    const error = new Error('Memories generation was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

function skippable(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: number; code?: string };
  return value.status === 404 || value.status === 415 || value.code === 'PHOTO_UNUSABLE';
}

/**
 * Bridges the locked selection order (including its fallback tail) into private,
 * job-scoped filesystem files. The successful job belongs to the caller until
 * releaseJob; unsuccessful/cancelled jobs always get released here.
 */
export async function prepareMemoriesFilm(
  photoOrder: MemoriesPhotoCandidate[],
  targetCount: number,
  metadata: MemoriesMetadata,
  dependencies: MemoriesPipelineDependencies,
  signal: AbortSignal,
  onProgress: (value: MemoriesProgress) => void,
): Promise<MemoriesFilm> {
  checkCancelled(signal);
  if (!photoOrder.length || targetCount < 1) throw new Error('No proof photos are available for this Pint War. Your final results are still shown below.');
  const target = Math.min(20, targetCount, photoOrder.length);
  const jobId = await dependencies.beginJob();
  const cancel = () => dependencies.releaseJob(jobId);
  signal.addEventListener('abort', cancel, { once: true });
  const selected: Omit<MemoriesMoment, 'startTime'>[] = [];
  const seen = new Set<string>();
  let skippedCount = 0;
  try {
    checkCancelled(signal);
    for (const photo of photoOrder) {
      if (selected.length >= target) break;
      checkCancelled(signal);
      if (seen.has(photo.pintLogId)) continue;
      seen.add(photo.pintLogId);
      try {
        const uri = await dependencies.stagePhoto(jobId, photo, signal);
        checkCancelled(signal);
        if (!uri.startsWith('file://')) throw new Error('A proof photo was not prepared as a local file.');
        selected.push({ ...photo, uri });
      } catch (error) {
        checkCancelled(signal);
        if (!skippable(error)) throw error; // Auth/network failures must not be hidden.
        skippedCount += 1;
      }
      onProgress({ progress: 0.35 * selected.length / target, label: `Preparing private photos · ${selected.length} / ${target}` });
    }
    if (!selected.length) throw new Error('No usable proof photos were available. Your war results are unchanged.');
    checkCancelled(signal);
    const video = await dependencies.render(jobId, selected.map((photo) => photo.uri), metadata, (fraction) => {
      if (!signal.aborted) onProgress({ progress: 0.35 + Math.max(0, Math.min(1, fraction)) * 0.64, label: 'Making your 30-second memory film…' });
    });
    checkCancelled(signal);
    if (!video.uri.startsWith('file://') || !video.uri.toLowerCase().endsWith('.mp4')
      || !Number.isFinite(video.duration) || Math.abs(video.duration - 30) > 0.25) {
      throw new Error('The generated MP4 could not be verified. Try again.');
    }
    const plan = memoriesFramePlan(selected.length);
    onProgress({ progress: 1, label: 'Your memory film is ready.' });
    return { ...video, jobId, skippedCount, moments: selected.map((photo, index) => ({ ...photo, startTime: plan[index].startTime })) };
  } catch (error) {
    dependencies.releaseJob(jobId);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
