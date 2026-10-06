import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { getPintWarMemoriesPhoto } from '@workspace/api-client-react';
import type { MemoriesMetadata, MemoriesPipelineDependencies, MemoriesVideo } from './memories-video-pipeline';

type NativeMemories = {
  beginJobAsync: () => Promise<string>;
  stagePhotoAsync: (jobId: string, base64: string, player: string, pub: string) => Promise<string>;
  createMemoriesVideoAsync: (jobId: string, paths: string[], metadata: MemoriesMetadata) => Promise<MemoriesVideo>;
  releaseJob: (jobId: string) => void;
  saveVideoAsync: (jobId: string) => Promise<'saved'>;
  shareVideoAsync: (jobId: string) => Promise<{ completed: boolean }>;
  addListener: (name: 'onProgress', callback: (event: { jobId: string; progress: number }) => void) => { remove: () => void };
};

export const nativeMemories = Platform.OS === 'ios'
  ? requireOptionalNativeModule<NativeMemories>('PintWarsMemories')
  : null;

export function privatePhotoBase64(blob: Blob) {
  if (!blob.type.startsWith('image/') || blob.size <= 0 || blob.size > 20_000_000) {
    return Promise.reject(Object.assign(new Error('This proof photo format is unavailable.'), { code: 'PHOTO_UNUSABLE' }));
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.includes(',')) {
        reject(new Error('The private proof photo could not be read.'));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('The private proof photo could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export function memoriesDependencies(leagueId: string): MemoriesPipelineDependencies {
  const native = nativeMemories;
  if (!native) throw new Error('Memories video creation requires the Pint Wars iPhone build with its native exporter.');
  return {
    beginJob: () => native.beginJobAsync(),
    stagePhoto: async (jobId, photo, signal) => {
      // Use the generated client and its existing authenticated private stream.
      // No Storage paths, signed URLs, or public URLs enter this pipeline.
      const blob = await getPintWarMemoriesPhoto(leagueId, photo.pintLogId, { signal });
      if (signal.aborted) throw Object.assign(new Error('Generation cancelled.'), { name: 'AbortError' });
      const base64 = await privatePhotoBase64(blob);
      try {
        return await native.stagePhotoAsync(jobId, base64, photo.playerName, photo.pubName ?? '');
      } catch (error) {
        if (error instanceof Error && error.message.includes('PHOTO_UNUSABLE')) {
          throw Object.assign(new Error('This proof photo could not be decoded.'), { code: 'PHOTO_UNUSABLE' });
        }
        throw error;
      }
    },
    render: async (jobId, paths, metadata, onProgress) => {
      const listener = native.addListener('onProgress', (event) => {
        if (event.jobId === jobId) onProgress(event.progress);
      });
      try { return await native.createMemoriesVideoAsync(jobId, paths, metadata); }
      finally { listener.remove(); }
    },
    releaseJob: (jobId) => native.releaseJob(jobId),
  };
}
