import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';
import { Button, Card, ErrorText, Screen, Title, uiStyles } from '@/components/AppUi';
import { usePubReviewSummary, usePubReviews, reviewKeys } from '@/hooks/usePubReviews';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { 
  deletePubReview, 
  reportPubReview, 
  createPubReview, 
  updatePubReview, 
  getPubReviewDetail,
  canReviewPub,
  type ReviewRow 
} from '@/src/lib/review-service';
import { getMyPubPassport, type PubPassportEntry } from '@/src/lib/league-service';
import { StarRating, RatingBadge } from '@/components/Reviews';

function RatingInput({
  label,
  rating,
  onChange,
  required = false,
  testID,
}: {
  label: string;
  rating: number;
  onChange: (r: number) => void;
  required?: boolean;
  testID: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.ratingInput}>
      <View style={styles.ratingInputHeader}>
        <Text style={[styles.ratingInputLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.ratingRequirement, { color: required ? colors.accent : colors.mutedForeground }]}>
          {required ? 'REQUIRED' : 'OPTIONAL'}
        </Text>
      </View>
      <StarRating
        rating={rating}
        onChange={onChange}
        size={22}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

function formatVisitDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ReportModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submissionInFlight = useRef(false);
  const colors = useColors();

  useEffect(() => {
    if (visible) {
      setReason('');
      setError('');
    }
  }, [visible]);

  async function submitReport() {
    const trimmedReason = reason.trim();
    if (!trimmedReason || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      await onSubmit(trimmedReason);
      setReason('');
      onClose();
    } catch {
      setError('We could not send the report. Your reason is saved; try again.');
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  function closeReport() {
    if (!submissionInFlight.current) onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeReport}
    >
      <View style={[styles.reportBackdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.reportSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.modalHeading}>
            <View style={[styles.modalIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="flag-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.modalHeadingCopy}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Report review</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                Reports help us review content. They do not award Pint Wars points.
              </Text>
            </View>
          </View>
          <TextInput
            value={reason}
            onChangeText={(value) => {
              setReason(value);
              if (error) setError('');
            }}
            accessibilityLabel="Reason for reporting this review"
            accessibilityHint="Explain why this review should be checked."
            placeholder="Tell us what needs attention…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.reportInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
            multiline
            textAlignVertical="top"
            testID="review-report-reason"
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <View style={styles.modalActions}>
            <View style={styles.modalAction}>
              <Button label="Cancel" variant="quiet" onPress={closeReport} disabled={isSubmitting} />
            </View>
            <View style={styles.modalAction}>
              <Button
                label="Send report"
                onPress={() => void submitReport()}
                loading={isSubmitting}
                disabled={!reason.trim()}
                testID="submit-review-report"
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function PubScreen() {
  const { placeId, provider, name, address, pintLogId } = useLocalSearchParams<{
    placeId: string;
    provider: string;
    name?: string;
    address?: string;
    pintLogId?: string;
  }>();
  const colors = useColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const summaryQuery = usePubReviewSummary(user?.id ?? '', provider as string, placeId as string);
  const reviewsQuery = usePubReviews(provider as string, placeId as string);
  const eligibilityQuery = useQuery({
    queryKey: ['pub-reviews', 'eligibility', user?.id, provider, placeId],
    queryFn: () => canReviewPub(provider as string, placeId as string),
    enabled: Boolean(user && provider && placeId),
  });

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingReview, setEditingReview] = useState<ReviewRow | null>(null);
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);

  if (!placeId || !provider) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Pub', headerBackTitle: 'Back' }} />
        <View style={uiStyles.content}><ErrorText>Missing pub details.</ErrorText></View>
      </Screen>
    );
  }

  const handleDelete = (reviewId: string) => {
    Alert.alert('Delete Review', 'Are you sure you want to delete your review?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
         try {
           await deletePubReview(reviewId);
           queryClient.invalidateQueries({ queryKey: reviewKeys.all });
           queryClient.invalidateQueries({ queryKey: ['pub-passport'] });
         } catch (e) {
           Alert.alert('Error', 'Could not delete review');
         }
      }}
    ]);
  };

  const handleReportSubmit = async (reason: string) => {
    if (!reportingReviewId) return;
    try {
      await reportPubReview(reportingReviewId, reason);
      Alert.alert('Reported', 'Thank you. The review has been reported.');
    } catch (e) {
      Alert.alert('Error', 'Could not report review.');
    }
  };

  const handleWritePress = async () => {
    if (summaryQuery.data?.current_user_review_id) {
       const currentUserReviewId = summaryQuery.data.current_user_review_id;
       let rev = reviewsQuery.data?.find(r => r.id === currentUserReviewId);
       if (!rev) {
          rev = await getPubReviewDetail(currentUserReviewId) || undefined;
       }
       setEditingReview(rev || null);
    } else {
       setEditingReview(null);
    }
    setIsFormVisible(true);
  };

  const avgAtmosphere = summaryQuery.data?.average_atmosphere || 0;
  const avgDrinks = summaryQuery.data?.average_pints_drinks || 0;
  const avgStaff = summaryQuery.data?.average_staff || 0;
  const avgMusic = summaryQuery.data?.average_music || 0;
  const overallAvg = (avgAtmosphere + avgDrinks + avgStaff + avgMusic) / 4;

  return (
    <Screen>
      <Stack.Screen options={{ title: name || 'Pub', headerBackTitle: 'Back' }} />
      <ScrollView contentContainerStyle={uiStyles.content} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 24, gap: 8 }}>
          <Title>{name}</Title>
          {address ? <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 }}>{address}</Text> : null}
        </View>

        <Card style={{ marginTop: 24, gap: 12, paddingVertical: 24, alignItems: 'center' }}>
          {summaryQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
          {summaryQuery.data ? (
            summaryQuery.data.review_count > 0 ? (
              <>
                 <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 56, color: colors.foreground, lineHeight: 60 }}>
                   {overallAvg.toFixed(1)}
                 </Text>
                 <StarRating rating={overallAvg} readonly size={32} />
                 <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 4 }}>
                   Based on {summaryQuery.data.review_count} {summaryQuery.data.review_count === 1 ? 'review' : 'reviews'}
                 </Text>
                 <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                    <RatingBadge label="Atmosphere" rating={Number(avgAtmosphere.toFixed(1))} />
                    <RatingBadge label="Drinks" rating={Number(avgDrinks.toFixed(1))} />
                 </View>
                 <View style={{ flexDirection: 'row', gap: 16 }}>
                    <RatingBadge label="Staff" rating={Number(avgStaff.toFixed(1))} />
                    <RatingBadge label="Music" rating={Number(avgMusic.toFixed(1))} />
                 </View>
              </>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>No reviews yet. Be the first to review!</Text>
            )
          ) : null}
        </Card>

        <View style={{ marginTop: 24 }}>
           <Button 
             label={
               summaryQuery.data?.current_user_review_id
                 ? 'Edit Your Review'
                 : eligibilityQuery.data === false
                   ? 'Log a pint here to review'
                   : 'Write a Review'
             }
             onPress={handleWritePress} 
              disabled={
                eligibilityQuery.isLoading
                || eligibilityQuery.data === false
                || (!summaryQuery.data?.current_user_review_id && !pintLogId)
              }
           />
           {eligibilityQuery.isError ? (
             <ErrorText>Review eligibility could not be checked. Try again later.</ErrorText>
           ) : null}
        </View>

        <View style={{ gap: 16, marginTop: 32 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: colors.foreground }}>Reviews</Text>
          {reviewsQuery.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} /> : null}
          {reviewsQuery.data?.length === 0 && !reviewsQuery.isLoading ? (
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>No reviews found for this pub.</Text>
          ) : null}
          {reviewsQuery.data?.map(review => {
            const reviewAvg = (review.atmosphere_rating + review.pints_drinks_rating + review.staff_rating + review.music_rating) / 4;
            return (
              <Card key={review.id} style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ gap: 4, flex: 1, paddingRight: 16 }}>
                    <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.foreground }}>
                      {review.author_name}
                    </Text>
                    <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.mutedForeground }}>
                      {new Date(review.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <StarRating rating={reviewAvg} readonly size={16} />
                </View>
                
                {review.review_text ? (
                  <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.foreground, lineHeight: 22 }}>
                    {review.review_text}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  <RatingBadge label="Atmosphere" rating={review.atmosphere_rating} />
                  <RatingBadge label="Drinks" rating={review.pints_drinks_rating} />
                  <RatingBadge label="Staff" rating={review.staff_rating} />
                  <RatingBadge label="Music" rating={review.music_rating} />
                  {review.food_rating ? <RatingBadge label="Food" rating={review.food_rating} /> : null}
                  {review.value_rating ? <RatingBadge label="Value" rating={review.value_rating} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                    <FontAwesome name={review.would_return ? "check" : "times"} size={10} color={review.would_return ? colors.primary : colors.destructive} />
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: colors.mutedForeground }}>
                      {review.would_return ? "Would return" : "Would not return"}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 8 }}>
                  {user?.id === review.user_id ? (
                    <>
                      <Pressable onPress={() => { setEditingReview(review); setIsFormVisible(true); }} hitSlop={10}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDelete(review.id)} hitSlop={10}>
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.destructive, textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable onPress={() => setReportingReviewId(review.id)} hitSlop={10}>
                       <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 }}>Report</Text>
                    </Pressable>
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      </ScrollView>

      <ReviewFormModal 
        visible={isFormVisible} 
        onClose={() => setIsFormVisible(false)} 
        pubProvider={provider as string} 
        pubPlaceId={placeId as string} 
        qualifyingPintLogId={pintLogId}
        existingReview={editingReview} 
      />
      <ReportModal 
        visible={!!reportingReviewId} 
        onClose={() => setReportingReviewId(null)} 
        onSubmit={handleReportSubmit} 
      />
    </Screen>
  );
}

function ReviewFormModal({
  visible,
  onClose,
  pubProvider,
  pubPlaceId,
  qualifyingPintLogId,
  existingReview,
}: {
  visible: boolean;
  onClose: () => void;
  pubProvider: string;
  pubPlaceId: string;
  qualifyingPintLogId?: string;
  existingReview: ReviewRow | null;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [atmosphere, setAtmosphere] = useState(0);
  const [pintsDrinks, setPintsDrinks] = useState(0);
  const [staff, setStaff] = useState(0);
  const [music, setMusic] = useState(0);
  const [food, setFood] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setAtmosphere(existingReview?.atmosphere_rating || 0);
      setPintsDrinks(existingReview?.pints_drinks_rating || 0);
      setStaff(existingReview?.staff_rating || 0);
      setMusic(existingReview?.music_rating || 0);
      setFood(existingReview?.food_rating ?? null);
      setValue(existingReview?.value_rating ?? null);
      setWouldReturn(existingReview?.would_return ?? null);
      setReviewText(existingReview?.review_text || '');
    }
  }, [visible, existingReview]);

  const handleSubmit = async () => {
    if (!atmosphere || !pintsDrinks || !staff || !music) {
      Alert.alert('Missing Ratings', 'Please rate Atmosphere, Pints/Drinks, Staff, and Music.');
      return;
    }
    if (wouldReturn === null) {
      Alert.alert('Would You Return?', 'Please choose Yes or No.');
      return;
    }
    setIsSubmitting(true);
    try {
      const input = {
        pubProvider, pubPlaceId,
        atmosphereRating: atmosphere,
        pintsDrinksRating: pintsDrinks,
        staffRating: staff,
        musicRating: music,
        foodRating: food,
        valueRating: value,
        wouldReturn,
        reviewText
      };
      
       if (existingReview?.id) {
        await updatePubReview(existingReview.id, input);
      } else {
         if (!qualifyingPintLogId) {
           throw new Error('Log a pint from an active Pint War before reviewing this pub.');
         }
         await createPubReview({ ...input, pintLogId: qualifyingPintLogId });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['pub-passport'] }),
      ]);
      onClose();
    } catch (error) {
      if (__DEV__) {
        const diagnosticError = error as {
          message?: unknown;
          code?: unknown;
          details?: unknown;
          hint?: unknown;
        };

        console.error('[Pint Wars] pub review save failed', {
          message:
            typeof diagnosticError?.message === 'string'
              ? diagnosticError.message
              : String(error),
          code: diagnosticError?.code ?? null,
          details: diagnosticError?.details ?? null,
          hint: diagnosticError?.hint ?? null,
        });
      }

      Alert.alert(
        'Could Not Save Review',
        error instanceof Error ? error.message : 'Could not save review',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, gap: 32, paddingBottom: 60, paddingTop: 40 }}>
          <Title>{existingReview ? 'Edit Review' : 'Write a Review'}</Title>
          
          <View style={{ gap: 20 }}>
            <RatingInput label="Atmosphere *" rating={atmosphere} onChange={setAtmosphere} />
            <RatingInput label="Pints & Drinks *" rating={pintsDrinks} onChange={setPintsDrinks} />
            <RatingInput label="Staff *" rating={staff} onChange={setStaff} />
            <RatingInput label="Music *" rating={music} onChange={setMusic} />
            
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: colors.foreground, marginTop: 12 }}>Optional Ratings</Text>
            <RatingInput label="Food" rating={food ?? 0} onChange={setFood} />
            {food ? (
              <Pressable onPress={() => setFood(null)}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: 'right' }}>Clear food rating</Text>
              </Pressable>
            ) : null}
            <RatingInput label="Value" rating={value ?? 0} onChange={setValue} />
            {value ? (
              <Pressable onPress={() => setValue(null)}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: 'right' }}>Clear value rating</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.foreground }}>Would you return?</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable 
                onPress={() => setWouldReturn(true)} 
                style={[{ flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }, wouldReturn === true ? { borderColor: colors.primary, backgroundColor: colors.primary + '20' } : { borderColor: colors.border }]}
              >
                <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 15 }, wouldReturn === true ? { color: colors.primary } : { color: colors.mutedForeground }]}>Yes</Text>
              </Pressable>
              <Pressable 
                onPress={() => setWouldReturn(false)} 
                style={[{ flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }, wouldReturn === false ? { borderColor: colors.destructive, backgroundColor: colors.destructive + '20' } : { borderColor: colors.border }]}
              >
                <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 15 }, wouldReturn === false ? { color: colors.destructive } : { color: colors.mutedForeground }]}>No</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.foreground }}>Review (Optional)</Text>
            <TextInput
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              maxLength={3000}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, color: colors.foreground, minHeight: 120, backgroundColor: colors.card, fontFamily: 'Inter_400Regular', fontSize: 16 }}
              placeholder="Share your thoughts about this pub..."
              placeholderTextColor={colors.mutedForeground}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" variant="quiet" onPress={onClose} disabled={isSubmitting} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Save Review" onPress={handleSubmit} loading={isSubmitting} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
