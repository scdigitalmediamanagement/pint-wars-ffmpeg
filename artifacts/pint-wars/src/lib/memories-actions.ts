export type MemoriesActionResult = { notice: string; failed: boolean; photosDenied: boolean };
type Actions = {
  saveVideoAsync: (jobId: string) => Promise<'saved'>;
  shareVideoAsync: (jobId: string) => Promise<{ completed: boolean }>;
};

/** Only deliberate native completion is reported as save/share success. */
export async function runMemoriesAction(
  kind: 'save' | 'share', jobId: string, native: Actions,
): Promise<MemoriesActionResult> {
  try {
    if (kind === 'save') {
      await native.saveVideoAsync(jobId);
      return { notice: 'Your Memories video was saved to Photos.', failed: false, photosDenied: false };
    }
    const result = await native.shareVideoAsync(jobId);
    return { notice: result.completed ? 'Your Memories MP4 was shared.' : '', failed: false, photosDenied: false };
  } catch (error) {
    const photosDenied = kind === 'save' && error !== null && typeof error === 'object'
      && 'code' in error && error.code === 'PHOTOS_PERMISSION_DENIED';
    return {
      notice: error instanceof Error && error.message ? error.message
        : kind === 'save' ? 'The video could not be saved. Try again.' : 'The MP4 could not be shared. Try again.',
      failed: true,
      photosDenied,
    };
  }
}
