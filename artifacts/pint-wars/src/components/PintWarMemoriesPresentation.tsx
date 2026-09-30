import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type DimensionValue,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  useGetPintWarMemoriesPhoto,
  type PintWarActivityEvent,
} from '@workspace/api-client-react';
import { Button, Card, uiStyles } from '@/components/AppUi';
import { useColors } from '@/hooks/useColors';
import type { LeagueSummary } from '@/src/types/league';
import {
  orderMemoriesPhotos,
  type MemoriesPhotoCandidate,
} from '@/src/lib/memories-selection';

const MAX_HIGHLIGHT_PHOTOS = 8;
const PREVIEW_BEATS = 8;
const OPENING_DURATION_MS = 2_500;
const PREVIEW_BEAT_DURATION_MS = 3_375;

type LeagueInfo = {
  id: string;
  name: string;
  completed_at: string | null;
};

type Props = {
  userId: string;
  league: LeagueInfo;
  summary: LeagueSummary;
  events: PintWarActivityEvent[];
};

type Phase = 'opening' | 'montage' | 'final';

function blobAsDataUri(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The proof photo could not be decoded.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('The proof photo could not be decoded.'));
    reader.readAsDataURL(blob);
  });
}

function dateLabel(value: string | null) {
  if (!value) return 'Pint War complete';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Pint War complete'
    : `Completed ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function withAlpha(color: string, opacity: number) {
  const match = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const hex = match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function metricLabel(index: number, summary: LeagueSummary) {
  const metrics = [
    { label: 'PINTS LOGGED', value: summary.stats.total_pints },
    { label: 'PUBS VISITED', value: summary.stats.pubs_visited },
    { label: 'QUALIFYING REVIEWS', value: summary.stats.reviews },
    { label: 'PLAYERS', value: summary.stats.player_count },
  ];
  return metrics[index % metrics.length];
}

function beatsForPhoto(photoIndex: number, photoCount: number) {
  if (photoCount <= 0) return 0;
  const baseBeats = Math.floor(PREVIEW_BEATS / photoCount);
  const extraBeats = PREVIEW_BEATS % photoCount;
  return baseBeats + (photoIndex < extraBeats ? 1 : 0);
}

function finalStandings(summary: LeagueSummary) {
  return [...summary.leaderboard].sort(
    (left, right) => right.points - left.points || left.joined_at.localeCompare(right.joined_at),
  );
}

function MemoriesFinalCard({
  league,
  summary,
  photoCount,
  unavailableCount,
  onReplay,
  isReplaying,
}: {
  league: LeagueInfo;
  summary: LeagueSummary;
  photoCount: number;
  unavailableCount: number;
  onReplay: () => void;
  isReplaying: boolean;
}) {
  const colors = useColors();
  const standings = finalStandings(summary);
  const highScore = standings[0]?.points ?? 0;
  const winners = highScore > 0
    ? standings.filter((member) => member.points === highScore)
    : [];

  return (
    <Animated.View entering={FadeInDown.duration(450)}>
      <Card style={[styles.finalCard, { borderColor: colors.accent }]}>
        <View style={styles.finalHeading}>
          <Ionicons name="trophy" size={24} color={colors.accent} />
          <View style={styles.finalHeadingCopy}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>PINT WAR MEMORIES</Text>
            <Text style={[styles.finalTitle, { color: colors.foreground }]}>The final round</Text>
            <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>
              {league.name} · {dateLabel(league.completed_at)}
            </Text>
          </View>
        </View>

        <View style={[styles.winnerBox, { backgroundColor: colors.muted }]}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>
            {!winners.length ? 'NO SCORE WINNER' : winners.length === 1 ? 'WINNER' : 'TIED WINNERS'}
          </Text>
          <Text style={[styles.winnerNames, { color: colors.foreground }]}>
            {winners.length ? winners.map((winner) => winner.display_name).join(' · ') : 'No score events recorded'}
          </Text>
          {winners.length ? (
            <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>
              {highScore} {highScore === 1 ? 'point' : 'points'}
            </Text>
          ) : null}
        </View>

        <View style={styles.metricsGrid}>
          <FinalMetric label="PINTS" value={summary.stats.total_pints} />
          <FinalMetric label="PUBS" value={summary.stats.pubs_visited} />
          <FinalMetric label="REVIEWS" value={summary.stats.reviews} />
          <FinalMetric label="PLAYERS" value={summary.stats.player_count} />
        </View>

        <View style={styles.standings}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>FINAL LEADERBOARD</Text>
          {standings.map((member, index) => (
            <View
              key={member.id}
              style={[
                styles.standingRow,
                { borderBottomColor: colors.border },
                index === standings.length - 1 ? styles.lastStanding : null,
              ]}
            >
              <Text style={[styles.standingRank, { color: colors.mutedForeground }]}>
                {index + 1}
              </Text>
              <Text style={[styles.standingName, { color: colors.foreground }]} numberOfLines={1}>
                {member.display_name}
              </Text>
              <Text style={[styles.standingPoints, { color: colors.foreground }]}>
                {member.points} {member.points === 1 ? 'pt' : 'pts'}
              </Text>
            </View>
          ))}
        </View>

        {unavailableCount > 0 ? (
          <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>
            {unavailableCount} unavailable {unavailableCount === 1 ? 'photo was' : 'photos were'} skipped.
          </Text>
        ) : photoCount === 0 ? (
          <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>
            No proof photos were available for this war. Final results are still shown here.
          </Text>
        ) : null}

        <Button
          label="Shuffle and replay"
          onPress={onReplay}
          loading={isReplaying}
          disabled={isReplaying}
          testID="shuffle-pint-war-memories"
        />
        <Text style={[styles.exportNotice, { color: colors.mutedForeground }]}>
          Preview only — no MP4 file is generated or saved.
        </Text>
      </Card>
    </Animated.View>
  );
}

function FinalMetric({ label, value }: { label: string; value: number }) {
  const colors = useColors();
  return (
    <View style={[styles.finalMetric, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.finalMetricValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.eyebrow, styles.finalMetricLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

export function PintWarMemoriesPresentation({ userId, league, summary, events }: Props) {
  const colors = useColors();
  const { height: windowHeight } = useWindowDimensions();
  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<Phase>('opening');
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [photosShown, setPhotosShown] = useState(0);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [currentPhoto, setCurrentPhoto] = useState<MemoriesPhotoCandidate | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [unavailableCount, setUnavailableCount] = useState(0);

  const photoOrder = useMemo(
    () => orderMemoriesPhotos(events),
    [events, generation],
  );
  const targetCount = Math.min(MAX_HIGHLIGHT_PHOTOS, photoOrder.length);
  const activeCandidate = phase === 'montage' && photosShown < targetCount
    ? photoOrder[candidateIndex]
    : undefined;
  const photoQuery = useGetPintWarMemoriesPhoto(
    league.id,
    activeCandidate?.pintLogId ?? 'memories-photo-disabled',
    {
      query: {
        enabled: Boolean(activeCandidate && phase === 'montage'),
        queryKey: [
          'pint-war-memories-photo',
          userId,
          league.id,
          activeCandidate?.pintLogId,
        ],
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  );
  const currentPhotoBeats = beatsForPhoto(photosShown, targetCount);
  const finalCount = Math.max(0, photosShown);

  useEffect(() => {
    if (phase !== 'opening') return;
    if (targetCount === 0) {
      setPhase('final');
      return;
    }
    const timer = setTimeout(() => setPhase('montage'), OPENING_DURATION_MS);
    return () => clearTimeout(timer);
  }, [phase, targetCount, generation]);

  useEffect(() => {
    if (phase !== 'montage') return;
    if (!activeCandidate || photosShown >= targetCount) {
      setPhase('final');
      setCurrentPhoto(null);
      setImageUri(null);
      setImageReady(false);
      setPhotoLoading(false);
      return;
    }
    setCurrentPhoto(null);
    setImageUri(null);
    setImageReady(false);
    setCurrentBeat(0);
    setPhotoLoading(true);
  }, [activeCandidate?.pintLogId, candidateIndex, phase, photoOrder.length, photosShown, targetCount]);

  useEffect(() => {
    if (phase !== 'montage' || !activeCandidate || !photoQuery.isError) return;
    setUnavailableCount((count) => count + 1);
    setPhotoLoading(false);
    setCandidateIndex((index) => index + 1);
  }, [activeCandidate?.pintLogId, phase, photoQuery.isError]);

  useEffect(() => {
    if (phase !== 'montage' || !activeCandidate || !photoQuery.data) return;
    const candidate = activeCandidate;
    let cancelled = false;
    let objectUrl: string | null = null;

    async function preparePhoto() {
      try {
        const uri = Platform.OS === 'web'
          ? (objectUrl = URL.createObjectURL(photoQuery.data!))
          : await blobAsDataUri(photoQuery.data!);
        if (cancelled) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return;
        }
        setCurrentPhoto(candidate);
        setImageUri(uri);
        setPhotoLoading(false);
      } catch {
        if (!cancelled) {
          setUnavailableCount((count) => count + 1);
          setPhotoLoading(false);
          setCandidateIndex((index) => index + 1);
        }
      }
    }

    void preparePhoto();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [activeCandidate, phase, photoQuery.data]);

  useEffect(() => {
    if (phase !== 'montage' || isPaused || !currentPhoto || !imageReady) return;
    const timer = setTimeout(() => {
      if (currentBeat + 1 < currentPhotoBeats) {
        setCurrentBeat((beat) => beat + 1);
        return;
      }
      setPhotosShown((count) => count + 1);
      setCandidateIndex((index) => index + 1);
      setCurrentBeat(0);
      setCurrentPhoto(null);
      setImageUri(null);
      setImageReady(false);
    }, PREVIEW_BEAT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [currentBeat, currentPhoto, currentPhotoBeats, imageReady, isPaused, phase]);

  function startDifferentMemory() {
    setGeneration((value) => value + 1);
    setPhase('opening');
    setCandidateIndex(0);
    setPhotosShown(0);
    setCurrentBeat(0);
    setCurrentPhoto(null);
    setImageUri(null);
    setImageReady(false);
    setPhotoLoading(false);
    setIsPaused(false);
    setUnavailableCount(0);
  }

  function skipCurrentPhoto() {
    if (!currentPhoto) return;
    setPhotosShown((count) => count + 1);
    setCandidateIndex((index) => index + 1);
    setCurrentBeat(0);
    setCurrentPhoto(null);
    setImageUri(null);
    setImageReady(false);
  }

  const screenHeight = Math.max(540, Math.min(690, windowHeight * 0.72));
  const overlayMetric = metricLabel(Math.max(0, finalCount + currentBeat - 1), summary);
  const activeProgress: DimensionValue = currentPhotoBeats > 0
    ? `${Math.round(((currentBeat + 1) / currentPhotoBeats) * 100)}%`
    : '0%';

  return (
    <ScrollView
      contentContainerStyle={[uiStyles.content, styles.page]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.stage, { minHeight: screenHeight, backgroundColor: colors.primary }]}>
        {phase === 'opening' ? (
          <Animated.View entering={FadeIn.duration(450)} style={styles.opening}>
            <View style={[styles.openingIcon, { backgroundColor: colors.primaryForeground }]}>
              <Ionicons name="sparkles" size={28} color={colors.accent} />
            </View>
            <Text style={[styles.stageEyebrow, { color: colors.accent }]}>PINT WAR MEMORIES</Text>
            <Text style={[styles.openingTitle, { color: colors.primaryForeground }]}>{league.name}</Text>
            <Text style={[styles.openingCopy, { color: colors.primaryForeground }]}>
              A randomized selection of proof photos from across the whole war, set to a ~30-second pace.
            </Text>
            <Text style={[styles.stageMeta, { color: colors.primaryForeground }]}>
              {targetCount} {targetCount === 1 ? 'photo' : 'photos'} selected · {dateLabel(league.completed_at)}
            </Text>
            <ActivityIndicator color={colors.accent} size="small" />
          </Animated.View>
        ) : null}

        {phase === 'montage' ? (
          <View style={styles.montage}>
            <View style={styles.progressRow}>
              {Array.from({ length: targetCount }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.progressTrack,
                    {
                      backgroundColor: colors.primaryForeground,
                      opacity: index <= photosShown ? 1 : 0.3,
                    },
                  ]}
                >
                  {index < photosShown ? (
                    <View style={[styles.progressFill, { backgroundColor: colors.accent, width: '100%' }]} />
                  ) : index === photosShown ? (
                    <View style={[styles.progressFill, { backgroundColor: colors.accent, width: activeProgress }]} />
                  ) : null}
                </View>
              ))}
            </View>

            {currentPhoto && imageUri ? (
              <Animated.View
                key={currentPhoto.pintLogId}
                entering={FadeIn.duration(420)}
                style={[styles.photoFrame, { backgroundColor: colors.primary }]}
              >
                <ExpoImage
                  source={{ uri: imageUri }}
                  contentFit="cover"
                  cachePolicy="none"
                  onLoad={() => setImageReady(true)}
                  onError={() => {
                    setUnavailableCount((count) => count + 1);
                    setCurrentPhoto(null);
                    setImageUri(null);
                    setImageReady(false);
                    setCurrentBeat(0);
                    setCandidateIndex((index) => index + 1);
                  }}
                  accessibilityLabel={`Private Pint War proof photo from ${currentPhoto.playerName}`}
                  style={styles.photo}
                />
                <LinearGradient
                  colors={[
                    withAlpha(colors.background, 0),
                    withAlpha(colors.background, 0.96),
                  ]}
                  locations={[0.38, 1]}
                  style={styles.photoShade}
                />
                <View style={[styles.photoTopline, { backgroundColor: withAlpha(colors.background, 0.84) }]}>
                  <Text style={[styles.photoCounter, { color: colors.foreground }]}>
                    {Math.min(photosShown + 1, targetCount)} / {targetCount}
                  </Text>
                  <Text style={[styles.photoWarLabel, { color: colors.foreground }]}>PINT WAR MEMORIES</Text>
                </View>
                <View style={styles.photoCaption}>
                  <Text style={[styles.photoPlayer, { color: colors.foreground }]}>{currentPhoto.playerName}</Text>
                  {currentPhoto.pubName ? (
                    <View style={styles.pubCaption}>
                      <Ionicons name="location-outline" size={15} color={colors.foreground} />
                      <Text style={[styles.pubCaptionText, { color: colors.foreground }]} numberOfLines={1}>
                        {currentPhoto.pubName}
                      </Text>
                    </View>
                  ) : null}
                  {currentBeat > 0 ? (
                    <Animated.View
                      key={currentBeat}
                      entering={FadeInDown.duration(240)}
                      style={[styles.metricOverlay, { backgroundColor: colors.card }]}
                    >
                      <Text style={[styles.metricOverlayValue, { color: colors.foreground }]}>
                        {overlayMetric.value}
                      </Text>
                      <Text style={[styles.metricOverlayLabel, { color: colors.foreground }]}>
                        {overlayMetric.label}
                      </Text>
                    </Animated.View>
                  ) : null}
                </View>
                {photoLoading ? (
                  <View style={styles.photoLoading}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
              </Animated.View>
            ) : (
              <View style={[styles.loadingPhoto, { backgroundColor: colors.primaryForeground }]}>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={[styles.stageMeta, { color: colors.primary }]}>
                  {photoLoading ? 'Loading a private proof photo…' : 'Preparing the next moment…'}
                </Text>
              </View>
            )}

            <View style={styles.controls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isPaused ? 'Resume memories preview' : 'Pause memories preview'}
                onPress={() => setIsPaused((paused) => !paused)}
                style={[styles.controlButton, { backgroundColor: colors.primaryForeground }]}
              >
                <Ionicons name={isPaused ? 'play' : 'pause'} size={17} color={colors.primary} />
                <Text style={[styles.controlText, { color: colors.primary }]}>
                  {isPaused ? 'RESUME' : 'PAUSE'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip this proof photo"
                disabled={!currentPhoto}
                onPress={skipCurrentPhoto}
                style={[styles.controlButton, { backgroundColor: colors.primaryForeground, opacity: currentPhoto ? 1 : 0.55 }]}
              >
                <Text style={[styles.controlText, { color: colors.primary }]}>SKIP</Text>
                <Ionicons name="play-skip-forward" size={16} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={[styles.previewNotice, { color: colors.primaryForeground }]}>
              Interactive preview · no video file is generated
            </Text>
          </View>
        ) : null}

        {phase === 'montage' && photoLoading && !currentPhoto ? (
          <View style={[styles.fetchingOverlay, { backgroundColor: withAlpha(colors.background, 0.25) }]}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : null}
      </View>

      {phase === 'final' ? (
        <MemoriesFinalCard
          league={league}
          summary={summary}
          photoCount={finalCount}
          unavailableCount={unavailableCount}
          onReplay={startDifferentMemory}
          isReplaying={false}
        />
      ) : (
        <Text style={[styles.privacyNotice, { color: colors.mutedForeground }]}>
          Proof photos are streamed privately for authenticated members of this completed Pint War.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16, paddingTop: 16, paddingBottom: 32 },
  stage: { overflow: 'hidden', borderRadius: 26, padding: 18, justifyContent: 'center' },
  opening: { alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 12, paddingVertical: 30 },
  openingIcon: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stageEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 2 },
  openingTitle: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38, textAlign: 'center' },
  openingCopy: { maxWidth: 300, fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 23, textAlign: 'center', opacity: 0.82 },
  stageMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center', opacity: 0.8 },
  montage: { gap: 14 },
  progressRow: { flexDirection: 'row', gap: 4 },
  progressTrack: { flex: 1, height: 4, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  photoFrame: { width: '100%', height: 475, maxHeight: 520, minHeight: 350, borderRadius: 20, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoShade: { ...StyleSheet.absoluteFill },
  photoTopline: { position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoCounter: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  photoWarLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1 },
  photoCaption: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 6 },
  photoPlayer: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  pubCaption: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pubCaptionText: { flexShrink: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  metricOverlay: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 8, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12 },
  metricOverlayValue: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  metricOverlayLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  photoLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  loadingPhoto: { height: 475, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 12 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  controlButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 20 },
  controlText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 },
  previewNotice: { fontFamily: 'Inter_500Medium', fontSize: 11, textAlign: 'center', opacity: 0.76 },
  fetchingOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  privacyNotice: { paddingHorizontal: 8, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  finalCard: { gap: 16, padding: 20, borderWidth: 1 },
  finalHeading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  finalHeadingCopy: { flex: 1, gap: 4 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  finalTitle: { fontFamily: 'Inter_700Bold', fontSize: 23 },
  mutedText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  winnerBox: { gap: 5, padding: 16, borderRadius: 16 },
  winnerNames: { fontFamily: 'Inter_700Bold', fontSize: 21, lineHeight: 27 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  finalMetric: { flexGrow: 1, flexBasis: '45%', minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 15 },
  finalMetricValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  finalMetricLabel: { fontSize: 9 },
  standings: { gap: 5 },
  standingRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  lastStanding: { borderBottomWidth: 0 },
  standingRank: { width: 20, fontFamily: 'Inter_700Bold', fontSize: 12 },
  standingName: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  standingPoints: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  exportNotice: { fontFamily: 'Inter_500Medium', fontSize: 11, lineHeight: 16, textAlign: 'center' },
});