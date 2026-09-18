import { getSupabase } from '@/src/lib/supabase';
import type { ReviewRpcRow } from '@/src/lib/database.types';

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