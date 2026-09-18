import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useQuery } from '@tanstack/react-query';
import { createReviewPhotoUrl } from '@/src/lib/review-service';
import { Image } from 'expo-image';

export function StarRating({ 
  rating, 
  onChange, 
  size = 20, 
  readonly = false 
}: { 
  rating: number; 
  onChange?: (r: number) => void; 
  size?: number;
  readonly?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(star => {
        const isFull = rating >= star;
        const isHalf = rating >= star - 0.5 && rating < star;
        const name = isFull ? 'star' : isHalf ? 'star-half-o' : 'star-o';
        return (
          <Pressable 
            key={star} 
            disabled={readonly} 
            onPress={() => onChange?.(star)}
            hitSlop={readonly ? 0 : 8}
          >
            <FontAwesome name={name} size={size} color={colors.accent} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function RatingBadge({ label, rating }: { label: string; rating: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
      <FontAwesome name="star" size={10} color={colors.accent} />
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.foreground }}>{rating}</Text>
      <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 11, color: colors.mutedForeground }}>{label}</Text>
    </View>
  );
}

export function PubReviewSummaryBadge({
  reviewCount,
  averageAtmosphere,
  averagePintsDrinks,
  averageStaff,
  averageMusic,
  currentUserReviewId,
}: {
  reviewCount: number;
  averageAtmosphere: number | null;
  averagePintsDrinks: number | null;
  averageStaff: number | null;
  averageMusic: number | null;
  currentUserReviewId: string | null;
}) {
  const colors = useColors();

  if (reviewCount === 0) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <FontAwesome name="star-o" size={14} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>No reviews yet</Text>
      </View>
    );
  }
  
  const avg = ((averageAtmosphere ?? 0) + (averagePintsDrinks ?? 0) + (averageStaff ?? 0) + (averageMusic ?? 0)) / 4;
  
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StarRating rating={avg} readonly size={14} />
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 14 }}>
          {avg.toFixed(1)}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 13 }}>
          ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
        </Text>
      </View>
      {currentUserReviewId ? (
        <Text style={{ color: colors.accent, fontFamily: 'Inter_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          You reviewed this
        </Text>
      ) : null}
    </View>
  );
}

export function ReviewPhoto({ path, size = 80 }: { path: string; size?: number }) {
  const colors = useColors();
  const { data: url } = useQuery({
    queryKey: ['review-photo', path],
    queryFn: () => createReviewPhotoUrl(path),
    staleTime: 1000 * 60 * 30,
  });

  return (
    <View style={[{ width: size, height: size, borderRadius: 8, backgroundColor: colors.border, overflow: 'hidden' }]}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
      ) : null}
    </View>
  );
}
