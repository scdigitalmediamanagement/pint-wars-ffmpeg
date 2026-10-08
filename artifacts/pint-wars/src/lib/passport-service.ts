import { fetch as expoFetch } from 'expo/fetch';
import { getSupabase } from '@/src/lib/supabase';

// A separate folder in the existing private bucket, never a War proof path.
const PASSPORT_PHOTO_BUCKET = 'pint-proofs';

export type PassportVisitInput = {
  pubProvider: string;
  pubPlaceId: string;
  pubName: string;
  pubAddress: string;
  latitude: number;
  longitude: number;
  photoUri: string;
  mimeType: string | null;
};

export async function logPassportVisit(input: PassportVisitInput) {
  if (!input.photoUri) throw new Error('Take exactly one photo before saving your visit.');
  if (input.pubProvider !== 'google_places' || !input.pubPlaceId || !input.pubName
    || !Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90
    || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) {
    throw new Error('Select a pub from the Map before logging a visit.');
  }
  const client = getSupabase();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('Sign in before logging a Passport visit.');
  const mimeType = input.mimeType || 'image/jpeg';
  const extension = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[mimeType] || 'jpg';
  const path = `${auth.user.id}/passport/${Date.now()}-${Math.random().toString(36).slice(2, 13)}.${extension}`;
  const response = await expoFetch(input.photoUri);
  if (!response.ok) throw new Error('The visit photo could not be read. Please try again.');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The visit photo is empty. Please take another photo.');
  const { error: uploadError } = await client.storage.from(PASSPORT_PHOTO_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(`The visit photo could not be uploaded: ${uploadError.message}`);

  let failureMessage = 'The visit could not be saved.';
  let definiteFailure = false;
  try {
    const { data, error } = await client.rpc('log_passport_visit', {
      p_pub_provider: input.pubProvider, p_pub_place_id: input.pubPlaceId,
      p_pub_name: input.pubName, p_pub_address: input.pubAddress,
      p_latitude: input.latitude, p_longitude: input.longitude, p_photo_path: path,
    });
    const saved = data?.[0];
    if (!error && saved) return saved;
    failureMessage = error?.message || failureMessage;
    definiteFailure = Boolean(error?.code && (
      /^[0-9A-Z]{5}$/.test(error.code) || error.code.startsWith('PGRST')
    ));
  } catch {
    // A transport exception does not establish that the transaction rolled back.
  }

  // A lost response can follow a committed transaction. Never delete a photo
  // referenced by a saved visit; reconcile through the owner-only RLS query.
  const recovery = await Promise.resolve(client.from('pub_visits').select('id,visited_at')
    .eq('photo_path', path).eq('user_id', auth.user.id).maybeSingle())
    .catch(() => ({ data: null, error: { message: 'Visit confirmation is unavailable' } }));
  if (recovery.data) {
    return { visit_id: recovery.data.id, visited_at: recovery.data.visited_at };
  }
  if (!recovery.error && definiteFailure) {
    const cleanup = await client.storage.from(PASSPORT_PHOTO_BUCKET).remove([path]);
    if (cleanup.error) {
      throw new Error('The visit could not be saved and its uploaded photo could not be removed. Please contact support.');
    }
    throw new Error(failureMessage);
  }
  // A request may still commit after a timeout, even when the first lookup
  // returns no row. Retain its photo rather than leaving a broken saved visit.
  throw new Error('The visit could not be confirmed. Refresh your Passport before trying again; its photo has not been removed.');
}
