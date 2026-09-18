import { fetch as expoFetch } from 'expo/fetch';
import { getSupabase } from '@/src/lib/supabase';
import type { ReviewRpcRow } from '@/src/lib/database.types';

const REVIEW_PHOTO_BUCKET = 'pub-review-photos';

export type ReviewRatingInput = {
  pubProvider: string;
  pubPlaceId: string;
  atmosphereRating: number;
  pintsDrinksRating: number;
  staffRating: number;
  musicRating: number;
  foodRating?: number | null;
  valueRating?: number | null;
  wouldReturn: boolean;
  reviewText?: string | null;
};

export type ReviewRow = ReviewRpcRow;

export type ReviewSummary = {
  pub_provider: string;
  pub_place_id: string;
  review_count: number;
  average_atmosphere: number | null;
  average_pints_drinks: number | null;
  average_staff: number | null;
  average_music: number | null;
  average_food: number | null;
  average_value: number | null;
  would_return_count: number;
  current_user_review_id: string | null;
};

function photoExtension(mimeType: string | null) {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

export async function canReviewPub(pubProvider: string, pubPlaceId: string) {
  const { data, error } = await getSupabase().rpc('can_review_pub', {
    p_pub_provider: pubProvider,
    p_pub_place_id: pubPlaceId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function getPubReviewSummary(pubProvider: string, pubPlaceId: string) {
  const { data, error } = await getSupabase().rpc('get_pub_review_summary', {
    p_pub_provider: pubProvider,
    p_pub_place_id: pubPlaceId,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return (result ?? null) as ReviewSummary | null;
}

export async function listPubReviews(
  pubProvider: string,
  pubPlaceId: string,
  limit = 50,
  offset = 0,
) {
  const { data, error } = await getSupabase().rpc('get_pub_reviews', {
    p_pub_provider: pubProvider,
    p_pub_place_id: pubPlaceId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as ReviewRow[];
}

export async function getPubReviewDetail(reviewId: string) {
  const { data, error } = await getSupabase().rpc('get_pub_review_detail', {
    p_review_id: reviewId,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return (result ?? null) as ReviewRow | null;
}

export async function createPubReview(input: ReviewRatingInput) {
  const { data, error } = await getSupabase().rpc('create_pub_review', {
    p_pub_provider: input.pubProvider,
    p_pub_place_id: input.pubPlaceId,
    p_atmosphere_rating: input.atmosphereRating,
    p_pints_drinks_rating: input.pintsDrinksRating,
    p_staff_rating: input.staffRating,
    p_music_rating: input.musicRating,
    p_food_rating: input.foodRating ?? null,
    p_value_rating: input.valueRating ?? null,
    p_would_return: input.wouldReturn,
    p_review_text: input.reviewText?.trim() || null,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('The review could not be created.');
  return result;
}

export async function updatePubReview(reviewId: string, input: Omit<ReviewRatingInput, 'pubProvider' | 'pubPlaceId'>) {
  const { data, error } = await getSupabase().rpc('update_pub_review', {
    p_review_id: reviewId,
    p_atmosphere_rating: input.atmosphereRating,
    p_pints_drinks_rating: input.pintsDrinksRating,
    p_staff_rating: input.staffRating,
    p_music_rating: input.musicRating,
    p_food_rating: input.foodRating ?? null,
    p_value_rating: input.valueRating ?? null,
    p_would_return: input.wouldReturn,
    p_review_text: input.reviewText?.trim() || null,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('The review could not be updated.');
  return result;
}

export async function deletePubReview(reviewId: string) {
  const review = await getPubReviewDetail(reviewId);
  if (review?.photo_paths.length) {
    const { error: cleanupError } = await getSupabase().storage
      .from(REVIEW_PHOTO_BUCKET)
      .remove(review.photo_paths);
    if (cleanupError) throw cleanupError;
  }
  const { data, error } = await getSupabase().rpc('delete_pub_review', {
    p_review_id: reviewId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function reportPubReview(reviewId: string, reason: string) {
  const { data, error } = await getSupabase().rpc('report_pub_review', {
    p_review_id: reviewId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return data as string;
}

export async function uploadReviewPhoto(
  userId: string,
  reviewId: string,
  photoUri: string,
  mimeType: string | null,
) {
  const response = await expoFetch(photoUri);
  if (!response.ok) throw new Error('The review photo could not be prepared for upload.');
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const storagePath = `${userId}/${reviewId}/${uniquePart}.${photoExtension(mimeType)}`;
  const { error: reserveError } = await getSupabase().rpc('attach_pub_review_photo', {
    p_review_id: reviewId,
    p_storage_path: storagePath,
  });
  if (reserveError) throw reserveError;
  const { error: uploadError } = await getSupabase().storage
    .from(REVIEW_PHOTO_BUCKET)
    .upload(storagePath, await response.arrayBuffer(), {
      contentType: mimeType ?? 'image/jpeg',
      upsert: false,
    });
  if (uploadError) {
    await getSupabase().rpc('delete_pub_review_photo', {
      p_storage_path: storagePath,
    });
    throw uploadError;
  }
  return storagePath;
}

export async function removeReviewPhoto(storagePath: string) {
  const { error: storageError } = await getSupabase().storage
    .from(REVIEW_PHOTO_BUCKET)
    .remove([storagePath]);
  if (storageError) throw storageError;
  const { error: rowError } = await getSupabase().rpc('delete_pub_review_photo', {
    p_storage_path: storagePath,
  });
  if (rowError) throw rowError;
}

export async function createReviewPhotoUrl(storagePath: string, expiresIn = 3600) {
  const { data, error } = await getSupabase().storage
    .from(REVIEW_PHOTO_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}