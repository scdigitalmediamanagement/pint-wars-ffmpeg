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
  const [submitted, setSubmitted] = useState(false);
  const submissionInFlight = useRef(false);
  const colors = useColors();

  useEffect(() => {
    if (visible) {
      setReason('');
      setError('');
      setSubmitted(false);
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
      setSubmitted(true);
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
      <View style={[styles.reportBackdrop, { backgroundColor: `${colors.foreground}80` }]}>
        <View style={[styles.reportSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {submitted ? (
            <>
              <View style={styles.modalHeading}>
                <View style={[styles.modalIcon, { backgroundColor: colors.muted }]}>
                  <Ionicons name="checkmark" size={21} color={colors.primary} />
                </View>
                <View style={styles.modalHeadingCopy}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Report sent</Text>
                  <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                    Thank you for helping us review this content. Reports do not award points.
                  </Text>
                </View>
              </View>
              <Button label="Done" onPress={onClose} />
            </>
          ) : (
            <>
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
                    disabled={!reason.trim() || isSubmitting}
                    testID="submit-review-report"
                  />
                </View>
              </View>
            </>
          )}
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
  const passportQuery = useQuery({
    queryKey: ['pub-passport', user?.id],
    queryFn: getMyPubPassport,
    enabled: Boolean(user),
  });

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
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
    Alert.alert(
      'Delete review?',
      'Any one-time review bonus already earned will remain. Recreating this review cannot earn the bonus again.',
      [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
         try {
           const deleted = await deletePubReview(reviewId);
           if (!deleted) throw new Error('The review was not deleted. Please try again.');
           await Promise.all([
             queryClient.invalidateQueries({ queryKey: reviewKeys.all }),
             queryClient.invalidateQueries({ queryKey: ['pub-passport'] }),
           ]);
           Alert.alert('Review deleted', 'Any review bonus already earned remains. Deleting or recreating a review does not earn points.');
         } catch (error) {
           Alert.alert(
             'Could not delete review',
             error instanceof Error ? error.message : 'Please try again.',
           );
         }
      }}
      ],
    );
  };

  const handleReportSubmit = async (reason: string) => {
    if (!reportingReviewId) return;
    await reportPubReview(reportingReviewId, reason);
  };

  const handleWritePress = async () => {
    if (isLoadingReview) return;
    const currentUserReviewId = summaryQuery.data?.current_user_review_id;
    setIsLoadingReview(true);
    try {
      if (currentUserReviewId) {
        let review = reviewsQuery.data?.find((item) => item.id === currentUserReviewId);
        if (!review) review = (await getPubReviewDetail(currentUserReviewId)) ?? undefined;
        if (!review) {
          Alert.alert('Could not load your review', 'Please try again in a moment.');
          return;
        }
        setEditingReview(review);
      } else {
       setEditingReview(null);
      }
      setIsFormVisible(true);
    } catch {
      Alert.alert('Could not load your review', 'Please try again in a moment.');
    } finally {
      setIsLoadingReview(false);
    }
  };

  const avgAtmosphere = summaryQuery.data?.average_atmosphere || 0;
  const avgDrinks = summaryQuery.data?.average_pints_drinks || 0;
  const avgStaff = summaryQuery.data?.average_staff || 0;
  const avgMusic = summaryQuery.data?.average_music || 0;
  const overallAvg = (avgAtmosphere + avgDrinks + avgStaff + avgMusic) / 4;
  const passportEntry = passportQuery.data?.find(
    (entry) => entry.pub_provider === provider && entry.pub_place_id === placeId,
  );
  const hasCurrentReview = Boolean(summaryQuery.data?.current_user_review_id);
  const canOpenReviewForm =
    hasCurrentReview ||
    (!summaryQuery.isLoading &&
      !summaryQuery.isError &&
      eligibilityQuery.data === true &&
      Boolean(pintLogId));
  const reviewButtonLabel = hasCurrentReview
    ? 'Edit your review'
    : !user
      ? 'Sign in to review'
      : isLoadingReview
        ? 'Loading your review…'
        : summaryQuery.isLoading
          ? 'Loading pub reviews…'
          : summaryQuery.isError
            ? 'Pub review details unavailable'
            : eligibilityQuery.isLoading
              ? 'Checking review access…'
              : eligibilityQuery.isError
                ? 'Review access unavailable'
                : eligibilityQuery.data === false
                  ? 'Log a pint here to review'
                  : !pintLogId
                    ? 'Open this pub from your Pint War log'
                    : 'Write a review';

  return (
    <Screen>
      <Stack.Screen options={{ title: name || 'Pub', headerBackTitle: 'Back' }} />
      <ScrollView contentContainerStyle={uiStyles.content} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: 24, gap: 8 }}>
          <Title>{name}</Title>
          {address ? <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 }}>{address}</Text> : null}
        </View>

        {user ? (
          <Card style={{ marginTop: 20, gap: 10 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>
              Your pub passport
            </Text>
            {passportQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start' }} />
            ) : passportQuery.isError ? (
              <>
                <ErrorText>Could not load your visit history.</ErrorText>
                <Button
                  label="Retry"
                  variant="quiet"
                  onPress={() => void passportQuery.refetch()}
                />
              </>
            ) : passportEntry ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Pints logged</Text>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold' }}>
                    {passportEntry.pint_count}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>Most recent visit</Text>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                    {formatVisitDate(passportEntry.most_recent_visit)}
                  </Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 }}>
                  {passportEntry.current_user_review_id ? 'You have reviewed this pub.' : 'You have not reviewed this pub yet.'}
                </Text>
              </>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
                No passport visit is recorded for this pub yet.
              </Text>
            )}
          </Card>
        ) : null}

        <Card style={{ marginTop: 24, gap: 12, paddingVertical: 24, alignItems: 'center' }}>
          {summaryQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
          {summaryQuery.isError ? (
            <>
              <ErrorText>Could not load pub ratings.</ErrorText>
              <Button label="Retry" variant="quiet" onPress={() => void summaryQuery.refetch()} />
            </>
          ) : null}
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
            label={reviewButtonLabel}
            onPress={handleWritePress}
            loading={isLoadingReview}
            disabled={isLoadingReview || !canOpenReviewForm}
            testID="open-pub-review-form"
          />
          {eligibilityQuery.isError ? (
              <View style={{ marginTop: 8 }}>
                <ErrorText>Review access could not be checked.</ErrorText>
                <Button
                  label="Retry check"
                  variant="quiet"
                  onPress={() => void eligibilityQuery.refetch()}
                />
              </View>
            ) : !hasCurrentReview && eligibilityQuery.data === true && !pintLogId ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 8 }}>
                Open this pub from the pint log you want to use. A new review must be submitted against a qualifying pint logged during an active Pint War.
              </Text>
            ) : !hasCurrentReview && eligibilityQuery.data === false ? (
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 8 }}>
                A review requires a pint logged at this pub during an active Pint War.
              </Text>
           ) : null}
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 8 }}>
              Each logged pint earns +1. A qualifying first review may earn a one-time +1 bonus per player at this pub. Editing, deleting or recreating, and reporting reviews earn no points.
            </Text>
        </View>

        <View style={{ gap: 16, marginTop: 32 }}>
          <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: colors.foreground }}>Reviews</Text>
          {reviewsQuery.isLoading ? <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} /> : null}
          {reviewsQuery.isError ? (
            <Card style={{ gap: 10 }}>
              <ErrorText>Could not load reviews.</ErrorText>
              <Button label="Retry" variant="quiet" onPress={() => void reviewsQuery.refetch()} />
            </Card>
          ) : null}
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
                      {formatVisitDate(review.created_at)}
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit your review"
                    testID={`edit-review-${review.id}`}
                    onPress={() => { setEditingReview(review); setIsFormVisible(true); }}
                    style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                  >
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>Edit</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete your review"
                        testID={`delete-review-${review.id}`}
                        onPress={() => handleDelete(review.id)}
                        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                      >
                        <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.destructive, textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Report this review"
                      testID={`report-review-${review.id}`}
                      onPress={() => setReportingReviewId(review.id)}
                      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                    >
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
  const insets = useSafeAreaInsets();
  const [atmosphere, setAtmosphere] = useState(0);
  const [pintsDrinks, setPintsDrinks] = useState(0);
  const [staff, setStaff] = useState(0);
  const [music, setMusic] = useState(0);
  const [food, setFood] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submissionInFlight = useRef(false);

  useEffect(() => {
    if (visible) {
      setSubmitError('');
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
    if (submissionInFlight.current) return;
    if (!atmosphere || !pintsDrinks || !staff || !music) {
      setSubmitError('Rate Atmosphere, Pints & Drinks, Staff, and Music before saving.');
      return;
    }
    if (wouldReturn === null) {
      setSubmitError('Choose whether you would return before saving.');
      return;
    }
    submissionInFlight.current = true;
    setIsSubmitting(true);
    setSubmitError('');
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
           throw new Error('Open this pub from a qualifying pint logged during an active Pint War.');
         }
         await createPubReview({ ...input, pintLogId: qualifyingPintLogId });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['pub-passport'] }),
      ]);
      onClose();
      Alert.alert(
        existingReview ? 'Review updated' : 'Review added',
        existingReview
          ? 'Editing a review does not award points.'
          : 'Your review was saved. A qualifying first review may earn the one-time review bonus.',
      );
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

      setSubmitError(error instanceof Error ? error.message : 'Could not save your review. Try again.');
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAwareScrollViewCompat
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: insets.bottom + 24,
            gap: 26,
          }}
          bottomOffset={72}
          keyboardShouldPersistTaps="handled"
        >
          <Title>{existingReview ? 'Edit Review' : 'Write a Review'}</Title>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 }}>
            {existingReview
              ? 'You can update your ratings and comments at any time. Editing does not award points.'
              : 'A qualifying first review may earn the one-time +1 review bonus. Saving confirms your review, not a points award.'}
          </Text>
          
          <View style={{ gap: 20 }}>
            <RatingInput label="Atmosphere" rating={atmosphere} onChange={(rating) => { setAtmosphere(rating); setSubmitError(''); }} required testID="review-atmosphere-rating" />
            <RatingInput label="Pints & Drinks" rating={pintsDrinks} onChange={(rating) => { setPintsDrinks(rating); setSubmitError(''); }} required testID="review-drinks-rating" />
            <RatingInput label="Staff" rating={staff} onChange={(rating) => { setStaff(rating); setSubmitError(''); }} required testID="review-staff-rating" />
            <RatingInput label="Music" rating={music} onChange={(rating) => { setMusic(rating); setSubmitError(''); }} required testID="review-music-rating" />
            
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: colors.foreground, marginTop: 12 }}>Optional Ratings</Text>
            <RatingInput label="Food" rating={food ?? 0} onChange={(rating) => { setFood(rating); setSubmitError(''); }} testID="review-food-rating" />
            {food ? (
              <Pressable accessibilityRole="button" onPress={() => setFood(null)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: 'right' }}>Clear food rating</Text>
              </Pressable>
            ) : null}
            <RatingInput label="Value" rating={value ?? 0} onChange={(rating) => { setValue(rating); setSubmitError(''); }} testID="review-value-rating" />
            {value ? (
              <Pressable accessibilityRole="button" onPress={() => setValue(null)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', textAlign: 'right' }}>Clear value rating</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.foreground }}>Would you return?</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable 
                onPress={() => { setWouldReturn(true); setSubmitError(''); }}
                accessibilityRole="radio"
                accessibilityLabel="Yes, I would return"
                accessibilityState={{ selected: wouldReturn === true }}
                testID="review-would-return-yes"
                style={[{ flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }, wouldReturn === true ? { borderColor: colors.primary, backgroundColor: colors.primary + '20' } : { borderColor: colors.border }]}
              >
                <Text style={[{ fontFamily: 'Inter_600SemiBold', fontSize: 15 }, wouldReturn === true ? { color: colors.primary } : { color: colors.mutedForeground }]}>Yes</Text>
              </Pressable>
              <Pressable 
                onPress={() => { setWouldReturn(false); setSubmitError(''); }}
                accessibilityRole="radio"
                accessibilityLabel="No, I would not return"
                accessibilityState={{ selected: wouldReturn === false }}
                testID="review-would-return-no"
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
              onChangeText={(text) => { setReviewText(text); setSubmitError(''); }}
              multiline
              maxLength={3000}
              accessibilityLabel="Review text, optional"
              accessibilityHint="Add a note about your experience at this pub."
              testID="review-text"
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, color: colors.foreground, minHeight: 120, backgroundColor: colors.card, fontFamily: 'Inter_400Regular', fontSize: 16 }}
              placeholder="Share your thoughts about this pub..."
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'right' }}>
              {reviewText.length}/3000
            </Text>
          </View>

          {submitError ? <ErrorText>{submitError}</ErrorText> : null}

          <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" variant="quiet" onPress={onClose} disabled={isSubmitting} testID="cancel-pub-review" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Save review" onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting} testID="save-pub-review" />
            </View>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ratingInput: { gap: 8 },
  ratingInputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingInputLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  ratingRequirement: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 },
  reportBackdrop: { flex: 1, justifyContent: 'center', padding: 20 },
  reportSheet: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 24, padding: 22, gap: 18 },
  modalHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  modalIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalHeadingCopy: { flex: 1, gap: 5, paddingTop: 2 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  reportInput: { minHeight: 132, borderWidth: 1, borderRadius: 16, padding: 14, fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 21 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalAction: { flex: 1 },
});
