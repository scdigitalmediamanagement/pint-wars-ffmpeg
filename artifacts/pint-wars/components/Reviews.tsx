import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export function StarRating({
  rating,
  onChange,
  size = 20,
  readonly = false,
  accessibilityLabel = 'Rating',
  testID,
}: {
  rating: number;
  onChange?: (r: number) => void;
  size?: number;
  readonly?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const colors = useColors();
  const safeRating = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;

  if (readonly) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${accessibilityLabel}: ${safeRating.toFixed(1)} out of 5 stars`}
        style={styles.stars}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isFull = safeRating >= star;
          const isHalf = safeRating >= star - 0.5 && safeRating < star;
          return (
            <FontAwesome
              key={star}
              accessible={false}
              name={isFull ? 'star' : isHalf ? 'star-half-o' : 'star-o'}
              size={size}
              color={colors.accent}
            />
          );
        })}
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`${accessibilityLabel} rating`}
      style={styles.stars}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isSelected = safeRating === star;
        return (
          <Pressable
            key={star}
            testID={testID ? `${testID}-${star}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={`${accessibilityLabel}, ${star} out of 5 stars`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange?.(star)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.starButton,
              { backgroundColor: isSelected ? colors.muted : 'transparent' },
              pressed ? styles.starPressed : null,
            ]}
          >
            <FontAwesome
              accessible={false}
              name={safeRating >= star ? 'star' : 'star-o'}
              size={size}
              color={colors.accent}
            />
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

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  starButton: {
    minWidth: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starPressed: { opacity: 0.65 },
});

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
