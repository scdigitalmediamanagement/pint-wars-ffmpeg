import { useQuery } from '@tanstack/react-query';
import {
  getPubReviewSummary,
  listPubReviews,
} from '@/src/lib/review-service';

export const reviewKeys = {
  all: ['pub-reviews'] as const,
  summary: (userId: string, provider: string, placeId: string) => [...reviewKeys.all, 'summary', userId, provider, placeId] as const,
  list: (provider: string, placeId: string) => [...reviewKeys.all, 'list', provider, placeId] as const,
  detail: (reviewId: string) => [...reviewKeys.all, 'detail', reviewId] as const,
};

export function usePubReviewSummary(userId: string, provider: string, placeId: string) {
  return useQuery({
    queryKey: reviewKeys.summary(userId, provider, placeId),
    queryFn: () => getPubReviewSummary(provider, placeId),
    enabled: Boolean(userId && provider && placeId),
  });
}

export function usePubReviews(provider: string, placeId: string) {
  return useQuery({
    queryKey: reviewKeys.list(provider, placeId),
    queryFn: () => listPubReviews(provider, placeId),
    enabled: Boolean(provider && placeId),
  });
}
