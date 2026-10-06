import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { getGetPintWarActivityQueryKey } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, ErrorText, Screen, Title, uiStyles } from '@/components/AppUi';
import { endLeagueEarly, getLeagueDashboard, getLeagueSummary, logPint, PintPhotoUploadError, retireFromLeague } from '@/src/lib/league-service';
import { getCurrentLocation } from '@/src/lib/location-service';
import { findNearbyPubs, type Coordinates, type NearbyPub } from '@/src/lib/pub-service';
import { CURRENT_LEAGUE_SCORING, type LeaguePoints } from '@/src/types/league';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';
import { ActiveWarScreen } from '@/components/active-war/ActiveWarScreen';
import { activeWarColors } from '@/components/active-war/styles';

function leagueDurationDays(startsAt: string, endsAt: string) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return Math.max(1, Math.ceil((end - start) / 86400000));
}

function dayNumber(startsAt: string, endsAt: string, status: string, now: number) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const durationDays = leagueDurationDays(startsAt, endsAt);
  if (status === 'completed') return durationDays;
  return Math.max(1, Math.min(durationDays, Math.floor((Math.min(now, end) - start) / 86400000) + 1));
}

function endTimeLabel(endsAt: string) {
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;
  return `Ends ${end.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at ${end.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })}`;
}

function remainingTimeLabel(endsAt: string, now: number) {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return 'End time unavailable';
  const remaining = end - now;
  if (remaining <= 0) return 'Time limit reached';

  const totalMinutes = Math.floor(remaining / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${Math.max(1, minutes)}m remaining`;
}

function rankOrdinal(rank: number) {
  const lastTwoDigits = rank % 100;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 13
      ? 'th'
      : rank % 10 === 1
        ? 'st'
        : rank % 10 === 2
          ? 'nd'
          : rank % 10 === 3
            ? 'rd'
            : 'th';
  return `${rank}${suffix}`;
}

function completedDateLabel(value: string | null) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function completedDurationDays(startsAt: string, completedAt: string | null, scheduledEndAt: string) {
  const start = new Date(startsAt).getTime();
  const end = new Date(completedAt ?? scheduledEndAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(1, Math.ceil((end - start) / 86400000));
}

type PendingPint = {
  photoUri: string;
  mimeType: string | null;
  location: Coordinates | null;
};

type JustLoggedPint = {
  pub: NearbyPub | null;
  pintLogId: string;
};

export default function LeagueDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [cameraError, setCameraError] = useState('');
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [logError, setLogError] = useState('');
  const [logErrorKind, setLogErrorKind] = useState<'photo' | 'submission' | null>(null);
  const [isPreparingPint, setIsPreparingPint] = useState(false);
  const [photoIntroVisible, setPhotoIntroVisible] = useState(false);
  const [photoReviewVisible, setPhotoReviewVisible] = useState(false);
  const [isSearchingPubs, setIsSearchingPubs] = useState(false);
  const [nearbyPubs, setNearbyPubs] = useState<NearbyPub[]>([]);
  const [selectedPub, setSelectedPub] = useState<NearbyPub | null>(null);
  const [nearbyPubMessage, setNearbyPubMessage] = useState('');
  const [pendingPint, setPendingPint] = useState<PendingPint | null>(null);
  const [justLoggedPint, setJustLoggedPint] = useState<JustLoggedPint | null>(null);
  const cameraLaunchInFlight = useRef(false);
  const pintSubmissionInFlight = useRef(false);
  const pubSearchGeneration = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['league-dashboard', leagueId],
    queryFn: () => getLeagueDashboard(leagueId as string),
    enabled: Boolean(leagueId),
    refetchInterval: 60_000,
  });
  const summaryQuery = useQuery({
    queryKey: ['league-summary', leagueId],
    queryFn: () => getLeagueSummary(leagueId as string),
    enabled: Boolean(leagueId && query.data?.league.status === 'completed'),
  });
  const logMutation = useMutation({
    mutationFn: (input: {
      photoUri: string;
      mimeType: string | null;
      latitude: number | null;
      longitude: number | null;
      pub: NearbyPub | null;
    }) => {
      if (!user || !leagueId) throw new Error('You must be signed in to log a pint.');
      return logPint({
        leagueId,
        userId: user.id,
        ...input,
      });
    },
    onSuccess: (result, variables) => {
      pintSubmissionInFlight.current = false;
      setIsPreparingPint(false);
      void queryClient.invalidateQueries({ queryKey: ['league-dashboard', leagueId] });
      void queryClient.invalidateQueries({
        queryKey: getGetPintWarActivityQueryKey(leagueId),
      });
      void queryClient.invalidateQueries({ queryKey: ['pub-passport'] });
      if (variables.pub && user) {
        void queryClient.invalidateQueries({
          queryKey: ['pub-reviews', 'eligibility', user.id, variables.pub.provider, variables.pub.placeId],
        });
      }
      setLogError('');
      setLogErrorKind(null);
      setPendingPint(null);
      setPhotoReviewVisible(false);
      setIsSearchingPubs(false);
      setNearbyPubs([]);
      setSelectedPub(null);
      setNearbyPubMessage('');
      setJustLoggedPint({
        pub: variables.pub,
        pintLogId: result.pintLogId,
      });
    },
    onError: (error) => {
      pintSubmissionInFlight.current = false;
      setIsPreparingPint(false);
      const isPhotoError = error instanceof PintPhotoUploadError;
      setLogErrorKind(isPhotoError ? 'photo' : 'submission');
      setLogError(
        isPhotoError
          ? 'Your photo could not be uploaded. Check your connection and retry; the photo is still ready.'
          : 'We could not finish logging this pint. Try again; your photo is still ready.',
      );
    },
  });
  const retireMutation = useMutation({
    mutationFn: () => {
      if (!leagueId) throw new Error('This Pint War could not be identified.');
      return retireFromLeague(leagueId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['league-dashboard', leagueId] }),
        queryClient.invalidateQueries({ queryKey: ['my-leagues'] }),
      ]);
    },
    onError: (error) => {
      Alert.alert(
        'Could Not Retire',
        error instanceof Error ? error.message : 'Could not retire from this Pint War. Please try again.',
      );
    },
  });
  const endLeagueMutation = useMutation({
    mutationFn: () => {
      if (!leagueId) throw new Error('This Pint War could not be identified.');
      return endLeagueEarly(leagueId);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['league-dashboard', leagueId] }),
        queryClient.invalidateQueries({ queryKey: ['my-leagues'] }),
      ]);
    },
    onError: (error) => {
      Alert.alert(
        'Could Not End Pint War',
        error instanceof Error ? error.message : 'Could not end this Pint War. Please try again.',
      );
    },
  });

  function cancelPintReview() {
    if (logMutation.isPending || pintSubmissionInFlight.current) return;
    pubSearchGeneration.current += 1;
    setPhotoReviewVisible(false);
    setPhotoIntroVisible(false);
    setPendingPint(null);
    setNearbyPubs([]);
    setSelectedPub(null);
    setNearbyPubMessage('');
    setIsSearchingPubs(false);
    setLogError('');
    setLogErrorKind(null);
    setCameraError('');
    setCameraBlocked(false);
  }

  function cancelPhotoIntro() {
    if (cameraLaunchInFlight.current) return;
    setPhotoIntroVisible(false);
    setCameraError('');
    setCameraBlocked(false);
  }

  function submitPendingPint(pub: NearbyPub | null) {
    const pint = pendingPint;
    if (!pint || logMutation.isPending || pintSubmissionInFlight.current) return;
    pintSubmissionInFlight.current = true;
    pubSearchGeneration.current += 1;
    setIsSearchingPubs(false);
    setLogError('');
    setLogErrorKind(null);
    logMutation.mutate({
      photoUri: pint.photoUri,
      mimeType: pint.mimeType,
      latitude: pint.location?.latitude ?? null,
      longitude: pint.location?.longitude ?? null,
      pub,
    });
  }

  async function identifyNearbyPubs() {
    if (!pendingPint || isSearchingPubs) return;
    const generation = ++pubSearchGeneration.current;
    setIsSearchingPubs(true);
    setNearbyPubs([]);
    setSelectedPub(null);
    setNearbyPubMessage('');

    try {
      const locationResult = await getCurrentLocation();
      if (generation !== pubSearchGeneration.current) return;
      if (locationResult.status !== 'success') {
        setNearbyPubMessage(
          locationResult.status === 'permission-denied'
            ? 'Location is off. You can still log without a pub.'
            : 'We could not get your location. You can still log without a pub.',
        );
        setPendingPint((current) => current ? { ...current, location: null } : current);
        return;
      }

      setPendingPint((current) => current
        ? { ...current, location: locationResult.coordinates }
        : current);
      const search = await findNearbyPubs(locationResult.coordinates);
      if (generation !== pubSearchGeneration.current) return;
      setNearbyPubs(search.pubs);
      if (!search.providerConfigured) {
        setNearbyPubMessage('Pub search is unavailable right now. You can still log without a pub.');
      } else if (!search.pubs.length) {
        setNearbyPubMessage('No nearby pubs were found. You can still log without a pub.');
      }
    } catch {
      if (generation === pubSearchGeneration.current) {
        setNearbyPubMessage('Nearby pubs could not be found. You can still log without a pub.');
      }
    } finally {
      if (generation === pubSearchGeneration.current) {
        setIsSearchingPubs(false);
      }
    }
  }

  async function takePintPhoto(isRetake = false) {
    if (
      cameraLaunchInFlight.current ||
      pintSubmissionInFlight.current ||
      (isRetake && !pendingPint)
    ) return;
    cameraLaunchInFlight.current = true;
    pubSearchGeneration.current += 1;
    setIsSearchingPubs(false);
    setPhotoIntroVisible(false);
    setPhotoReviewVisible(false);
    setIsPreparingPint(true);
    setCameraError('');
    setCameraBlocked(false);
    try {
      const permission: ImagePicker.PermissionResponse =
        await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setCameraBlocked(!permission.canAskAgain);
        setCameraError(
          permission.canAskAgain
            ? 'Camera access is needed for a fresh proof photo. You can allow it and try again.'
            : 'Camera access is off. Enable it in device settings, then try again.',
        );
        if (isRetake && pendingPint) {
          setPhotoReviewVisible(true);
        } else {
          setPhotoIntroVisible(true);
        }
        return;
      }

      const photo: ImagePicker.ImagePickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        cameraType: ImagePicker.CameraType.back,
      });
      if (photo.canceled || !photo.assets[0]) {
        if (isRetake && pendingPint) {
          setPhotoReviewVisible(true);
        } else {
          setPhotoIntroVisible(true);
        }
        return;
      }

      setPendingPint({
        photoUri: photo.assets[0].uri,
        mimeType: photo.assets[0].mimeType ?? null,
        location: null,
      });
      setNearbyPubs([]);
      setSelectedPub(null);
      setNearbyPubMessage('');
      setLogError('');
      setLogErrorKind(null);
      setPhotoReviewVisible(true);
    } catch {
      setCameraError('The camera could not be opened. Please try again.');
      if (isRetake && pendingPint) {
        setPhotoReviewVisible(true);
      } else {
        setPhotoIntroVisible(true);
      }
    } finally {
      cameraLaunchInFlight.current = false;
      setIsSearchingPubs(false);
      setIsPreparingPint(false);
    }
  }

  if (query.isLoading && !query.data) {
    return (
      <Screen>
        <View style={[uiStyles.content, styles.loadState]}>
          <Title eyebrow="Pint Wars">Loading your war</Title>
          <Card style={styles.loadingCard}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={[styles.loadingCopy, { color: colors.mutedForeground }]}>
              Getting your league, score, and leaderboard ready.
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  if (query.isError && !query.data) {
    return (
      <Screen>
        <View style={[uiStyles.content, styles.loadState]}>
          <Title eyebrow="Pint Wars">Could not load this war</Title>
          <Card style={styles.errorCard}>
            <Text style={[styles.errorCopy, { color: colors.mutedForeground }]}>
              Your league and standings could not be loaded. Check your connection and try again.
            </Text>
            <Button
              label="Retry"
              loading={query.isFetching}
              onPress={() => void query.refetch()}
              testID="retry-league-dashboard"
            />
          </Card>
        </View>
      </Screen>
    );
  }

  if (!query.data) {
    return (
      <Screen>
        <View style={[uiStyles.content, styles.loadState]}>
          <Title eyebrow="Pint Wars">League unavailable</Title>
          <Card style={styles.errorCard}>
            <Text style={[styles.errorCopy, { color: colors.mutedForeground }]}>
              This league could not be identified. Return to your Pint Wars list and open it again.
            </Text>
            <Button label="Back to Pint Wars" onPress={() => router.replace('/(tabs)/wars')} />
          </Card>
        </View>
      </Screen>
    );
  }

  const { league, members } = query.data;
  const currentMembership = members.find((member) => member.user_id === user?.id);
  const isCurrentUserHost = currentMembership?.role === 'host';
  const isCurrentUserRetired = currentMembership?.status === 'retired';
  const canRetire = league.status === 'active'
    && currentMembership?.status === 'active'
    && !isCurrentUserHost;
  const canEndLeagueEarly = league.status === 'active' && isCurrentUserHost;
  const day = dayNumber(league.starts_at, league.ends_at, league.status, now);
  const durationDays = leagueDurationDays(league.starts_at, league.ends_at);
  const leagueEndLabel = endTimeLabel(league.ends_at);
  const remainingLabel = remainingTimeLabel(league.ends_at, now);
  const completedDuration = completedDurationDays(league.starts_at, league.completed_at, league.ends_at);
  const sortedMembers = [...members].sort((a, b) => b.points - a.points || a.joined_at.localeCompare(b.joined_at));
  const rankedMembers: Array<{
    member: (typeof sortedMembers)[number];
    rank: number;
    isTied: boolean;
  }> = [];
  sortedMembers.forEach((member, index) => {
    const previous = rankedMembers[index - 1];
    const tiedWithPrevious = previous?.member.points === member.points;
    const tiedWithNext = sortedMembers[index + 1]?.points === member.points;
    rankedMembers.push({
      member,
      rank: tiedWithPrevious ? previous.rank : index + 1,
      isTied: tiedWithPrevious || tiedWithNext,
    });
  });
  const totalPoints: LeaguePoints = members.reduce((total, member) => total + member.points, 0);
  const highestPoints = sortedMembers[0]?.points ?? 0;
  const hasScores = highestPoints > 0;
  const currentStanding = rankedMembers.find((entry) => entry.member.user_id === user?.id);
  const winners = hasScores
    ? sortedMembers.filter((member) => member.points === highestPoints)
    : [];

  return (
    <Screen style={league.status === 'active' ? { backgroundColor: activeWarColors.background } : undefined}>
      {league.status === 'active' ? (
        <ActiveWarScreen
          key={league.id}
          dashboard={query.data}
          userId={user?.id}
          rankedMembers={rankedMembers}
          currentStanding={currentStanding}
          hasScores={hasScores}
          day={day}
          durationDays={durationDays}
          remainingLabel={remainingLabel}
          endLabel={leagueEndLabel}
          retired={isCurrentUserRetired}
          preparing={isPreparingPint || logMutation.isPending}
          error={!photoIntroVisible && !photoReviewVisible ? cameraError || logError : undefined}
          refreshError={query.isError}
          refreshing={query.isFetching}
          onRefresh={() => {
            void query.refetch();
            void queryClient.invalidateQueries({ queryKey: getGetPintWarActivityQueryKey(league.id) });
          }}
          onLogPint={() => {
            setCameraError('');
            setCameraBlocked(false);
            setPhotoIntroVisible(true);
          }}
          onInvite={isCurrentUserHost ? () => router.push({ pathname: '/war/invite', params: { leagueId: league.id } }) : undefined}
          retiring={retireMutation.isPending}
          ending={endLeagueMutation.isPending}
          onRetire={canRetire ? () => {
            Alert.alert(
              'Retire from this Pint War',
              "Are you sure you want to retire from this Pint War?\n\nYou won't be able to log any more pints or earn points in this league. Your existing points will remain.\n\nYour Pint Wars account and other leagues will not be affected.",
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Retire', style: 'destructive', onPress: () => retireMutation.mutate() },
              ],
            );
          } : undefined}
          onEnd={canEndLeagueEarly ? () => {
            Alert.alert(
              'End this Pint War?',
              'Are you sure you want to end this Pint War early? The current leaderboard will become final and no more points can be earned.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'End Pint War', style: 'destructive', onPress: () => endLeagueMutation.mutate() },
              ],
            );
          } : undefined}
        />
      ) : (
      <ScrollView
        contentContainerStyle={[uiStyles.content, styles.pageContent]}
        showsVerticalScrollIndicator={false}
      >
          <>
            <View style={styles.heading}>
              <Text style={[styles.kicker, { color: colors.accent }]}>WAR OVER</Text>
              <Title>{league.name}</Title>
            </View>
            <Card style={styles.summary}>
              <View style={uiStyles.row}>
                <View>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{members.length}</Text>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>PLAYERS</Text>
                </View>
                <View>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{totalPoints}</Text>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL POINTS</Text>
                </View>
                <View>
                  <Text style={[styles.metricValue, { color: colors.foreground }]}>{league.capacity}</Text>
                  <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>MAX PLAYERS</Text>
                </View>
              </View>
            </Card>
          </>

        {league.status === 'completed' ? (
          <>
            <Card style={styles.resultCard}>
              {hasScores ? (
                <>
                  <Text style={[styles.selectedLabel, { color: colors.accent }]}>
                    {winners.length === 1 ? 'WINNER' : 'TIED WINNERS'}
                  </Text>
                  <Text style={[styles.resultNames, { color: colors.foreground }]}>
                    {winners.map((winner) => winner.display_name).join(' · ')}
                  </Text>
                  <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                    Final score: {highestPoints} {highestPoints === 1 ? 'point' : 'points'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.selectedLabel, { color: colors.accent }]}>WAR COMPLETE</Text>
                  <Text style={[styles.resultNames, { color: colors.foreground }]}>No points scored</Text>
                  <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                    No score events were recorded in this Pint War.
                  </Text>
                </>
              )}
              <View style={styles.resultMeta}>
                <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                  Completed {completedDateLabel(league.completed_at)}
                </Text>
                <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                  Scheduled end {completedDateLabel(league.ends_at)}
                </Text>
                {completedDuration ? (
                  <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                    Duration {completedDuration} {completedDuration === 1 ? 'day' : 'days'}
                  </Text>
                ) : null}
              </View>
            </Card>
            {summaryQuery.isLoading ? (
              <Card style={styles.summaryLoading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.resultText, { color: colors.mutedForeground }]}>Loading War Summary…</Text>
              </Card>
            ) : summaryQuery.data ? (
              <Card style={styles.warStats}>
                <Text style={[styles.selectedLabel, { color: colors.accent }]}>WAR STATS</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: colors.foreground }]}>{summaryQuery.data.stats.total_pints}</Text>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>PINTS</Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: colors.foreground }]}>{summaryQuery.data.stats.pubs_visited}</Text>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>PUBS</Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: colors.foreground }]}>{summaryQuery.data.stats.reviews}</Text>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>REVIEWS</Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={[styles.statValue, { color: colors.foreground }]}>{summaryQuery.data.stats.player_count}</Text>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>PLAYERS</Text>
                  </View>
                </View>
              </Card>
            ) : summaryQuery.isError ? (
              <Card style={styles.errorCard}>
                <Text style={[styles.errorCopy, { color: colors.mutedForeground }]}>
                  War Summary is unavailable right now.
                </Text>
                <Button
                  label="Retry summary"
                  variant="secondary"
                  loading={summaryQuery.isFetching}
                  onPress={() => void summaryQuery.refetch()}
                  testID="retry-league-summary"
                />
              </Card>
            ) : null}
            <Card style={{ gap: 14, borderWidth: 1, borderColor: colors.accent }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.muted }}>
                  <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.selectedLabel, { color: colors.accent }]}>PINT WAR MEMORIES</Text>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 17 }}>
                    Relive the war
                  </Text>
                </View>
              </View>
              <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                Create a randomized highlight preview from photos captured across this completed Pint War.
              </Text>
              <Button
                label="Create Memories"
                onPress={() => router.push({
                  pathname: '/war/[leagueId]/memories',
                  params: { leagueId },
                })}
                testID="create-pint-war-memories"
              />
            </Card>
          </>
        ) : null}

        <View style={styles.leaderboardSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {league.status === 'completed' ? 'Final leaderboard' : 'Leaderboard'}
          </Text>
          <Card style={styles.leaderboardCard}>
            {rankedMembers.length === 0 ? (
              <View style={styles.noPlayers}>
                <Ionicons name="people-outline" size={22} color={colors.accent} />
                <Text style={[styles.emptyScoreTitle, { color: colors.foreground }]}>
                  No players to show yet
                </Text>
              </View>
            ) : rankedMembers.map(({ member, rank, isTied }) => {
              const isCurrentUser = member.user_id === user?.id;
              const isWinner = league.status === 'completed' && hasScores && member.points === highestPoints;
              const tieLabel = isWinner
                ? winners.length > 1
                  ? 'TIED LEAD'
                  : 'WINNER'
                : hasScores && isTied
                  ? 'TIED'
                  : null;
              return (
                <View
                  key={member.id}
                  style={[
                    styles.playerRow,
                    { borderBottomColor: colors.border },
                    isCurrentUser
                      ? {
                          backgroundColor: colors.muted,
                          borderColor: colors.accent,
                          borderWidth: 1,
                          borderRadius: 16,
                          paddingHorizontal: 10,
                          marginHorizontal: 4,
                          marginVertical: 4,
                        }
                      : null,
                  ]}
                >
                  <View
                    style={[
                      styles.rankBadge,
                      { backgroundColor: isCurrentUser ? colors.primary : colors.muted },
                    ]}
                  >
                    <Text style={[styles.rank, { color: isCurrentUser ? colors.primaryForeground : colors.accent }]}>
                      {hasScores ? rank : '—'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>
                      {member.display_name}{isCurrentUser ? ' (you)' : ''}
                    </Text>
                    <Text style={[styles.playerStatus, { color: colors.mutedForeground }]}>
                      {member.role === 'host' ? 'Host' : member.status === 'retired' ? 'Retired' : 'Player'}
                    </Text>
                  </View>
                  {tieLabel ? (
                    <Text style={[styles.winnerLabel, { color: colors.accent }]}>{tieLabel}</Text>
                  ) : null}
                  <Text style={[styles.pints, { color: colors.foreground }]}>
                    {member.points} {member.points === 1 ? 'pt' : 'pts'}
                  </Text>
                </View>
              );
            })}
          </Card>
        </View>
        {league.status === 'completed' ? (
          <Button label="Start Another Pint War" onPress={() => router.push('/war/create')} />
        ) : null}
        {canRetire ? (
          <Button
            label={retireMutation.isPending ? 'Retiring…' : 'Retire from this Pint War'}
            variant="quiet"
            loading={retireMutation.isPending}
            onPress={() => {
              Alert.alert(
                'Retire from this Pint War',
                "Are you sure you want to retire from this Pint War?\n\nYou won't be able to log any more pints or earn points in this league. Your existing points will remain.\n\nYour Pint Wars account and other leagues will not be affected.",
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Retire', style: 'destructive', onPress: () => retireMutation.mutate() },
                ],
              );
            }}
          />
        ) : null}
        {canEndLeagueEarly ? (
          <Button
            label={endLeagueMutation.isPending ? 'Ending…' : 'End Pint War Early'}
            variant="quiet"
            loading={endLeagueMutation.isPending}
            onPress={() => {
              Alert.alert(
                'End this Pint War?',
                'Are you sure you want to end this Pint War early? The current leaderboard will become final and no more points can be earned.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'End Pint War', style: 'destructive', onPress: () => endLeagueMutation.mutate() },
                ],
              );
            }}
          />
        ) : null}
        {members.some((member) => member.user_id === user?.id && member.role === 'host') ? (
          <Pressable onPress={() => router.push({ pathname: '/war/invite', params: { leagueId: league.id } })}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>Manage invites</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      )}

      <Modal
        visible={photoIntroVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={cancelPhotoIntro}
      >
        <View style={styles.modalBackdrop}>
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground, opacity: 0.45 }]}
          />
          <View
            style={[
              styles.pintFlowSheet,
              {
                backgroundColor: colors.background,
                paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) + 16,
              },
            ]}
          >
            <View style={[styles.photoIntroIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="camera-outline" size={28} color={colors.accent} />
            </View>
            <Text style={[styles.flowKicker, { color: colors.accent }]}>FRESH PHOTO PROOF</Text>
            <Text style={[styles.flowTitle, { color: colors.foreground }]}>Show us this pint.</Text>
            <Text style={[styles.flowBody, { color: colors.mutedForeground }]}>
              Take a new photo of your pint. You’ll review it before logging. Finding the pub is optional—you can continue without location or pub identification.
            </Text>

            {cameraError ? <ErrorText>{cameraError}</ErrorText> : null}
            {cameraBlocked && Platform.OS !== 'web' ? (
              <Button
                label="Open device settings"
                variant="quiet"
                onPress={() => {
                  void Linking.openSettings().catch(() => {
                    setCameraError('Open device settings and allow camera access for Pint Wars.');
                  });
                }}
              />
            ) : null}
            <Button
              label="Open camera"
              loading={isPreparingPint}
              onPress={() => void takePintPhoto()}
              testID="pint-intro-camera"
            />
            <Button
              label="Cancel"
              variant="quiet"
              disabled={isPreparingPint}
              onPress={cancelPhotoIntro}
              testID="pint-intro-cancel"
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={photoReviewVisible && Boolean(pendingPint)}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={cancelPintReview}
      >
        <View style={styles.modalBackdrop}>
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground, opacity: 0.45 }]}
          />
          <View
            style={[
              styles.pintReviewSheet,
              {
                backgroundColor: colors.background,
                paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) + 12,
              },
            ]}
          >
            <ScrollView
              style={styles.reviewScroll}
              contentContainerStyle={styles.reviewContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.pubSheetHeader}>
                <Text style={[styles.flowKicker, { color: colors.accent }]}>PHOTO READY</Text>
                <Text style={[styles.pubSheetTitle, { color: colors.foreground }]}>Review your pint</Text>
                <Text style={[styles.pubSheetSubtitle, { color: colors.mutedForeground }]}>
                  Check the fresh photo before it goes on the war board.
                </Text>
              </View>

              {pendingPint ? (
                <Image
                  source={{ uri: pendingPint.photoUri }}
                  resizeMode="cover"
                  accessibilityLabel="Preview of the fresh pint proof photo"
                  style={styles.pintPhotoPreview}
                />
              ) : null}

              <View style={styles.photoReviewActions}>
                <View style={styles.photoReviewAction}>
                  <Button
                    label="Retake photo"
                    variant="secondary"
                    disabled={logMutation.isPending || isPreparingPint}
                    onPress={() => void takePintPhoto(true)}
                    testID="pint-photo-retake"
                  />
                </View>
                <View style={styles.photoReviewAction}>
                  <Button
                    label="Cancel"
                    variant="quiet"
                    disabled={logMutation.isPending || isPreparingPint}
                    onPress={cancelPintReview}
                    testID="pint-photo-cancel"
                  />
                </View>
              </View>

              {cameraError ? <ErrorText>{cameraError}</ErrorText> : null}
              {cameraBlocked && Platform.OS !== 'web' ? (
                <Button
                  label="Open device settings"
                  variant="quiet"
                  onPress={() => {
                    void Linking.openSettings().catch(() => {
                      setCameraError('Open device settings and allow camera access for Pint Wars.');
                    });
                  }}
                />
              ) : null}

              <Card style={styles.pubIdentificationCard}>
                <View style={styles.pubIdentificationHeading}>
                  <View style={[styles.pubIdentificationIcon, { backgroundColor: colors.muted }]}>
                    <Ionicons name="location-outline" size={20} color={colors.accent} />
                  </View>
                  <View style={styles.pubIdentificationCopy}>
                    <Text style={[styles.pubName, { color: colors.foreground }]}>Pub (optional)</Text>
                    <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                      Find a nearby pub, or log without one.
                    </Text>
                  </View>
                </View>

                {isSearchingPubs ? (
                  <View style={styles.pubLoading}>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                      Checking nearby pubs. You can still log without one.
                    </Text>
                  </View>
                ) : null}

                {!isSearchingPubs && !nearbyPubs.length && !nearbyPubMessage ? (
                  <Button
                    label="Find nearby pubs"
                    variant="secondary"
                    onPress={() => void identifyNearbyPubs()}
                    testID="find-nearby-pubs"
                  />
                ) : null}

                {nearbyPubMessage ? (
                  <View style={styles.pubSearchMessage}>
                    <Text style={[styles.pubEmptyText, { color: colors.mutedForeground }]}>
                      {nearbyPubMessage}
                    </Text>
                    <Button
                      label="Try again"
                      variant="quiet"
                      onPress={() => void identifyNearbyPubs()}
                      testID="retry-nearby-pubs"
                    />
                  </View>
                ) : null}

                {nearbyPubs.map((pub) => {
                  const isSelected =
                    selectedPub?.provider === pub.provider &&
                    selectedPub.placeId === pub.placeId;
                  return (
                    <Pressable
                      key={`${pub.provider}:${pub.placeId}`}
                      accessibilityRole="radio"
                      accessibilityLabel={`${pub.name}${pub.address ? `, ${pub.address}` : ''}`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setSelectedPub(pub)}
                      style={[
                        styles.pubRow,
                        {
                          borderColor: isSelected ? colors.accent : colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                    >
                      <View style={styles.pubResultCopy}>
                        <Text style={[styles.pubName, { color: colors.foreground }]}>{pub.name}</Text>
                        <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                          {pub.address || 'Address unavailable'}
                        </Text>
                      </View>
                      <Text style={[styles.pubDistance, { color: colors.accent }]}>
                        {pub.distanceMeters < 1000
                          ? `${Math.round(pub.distanceMeters)} m`
                          : `${(pub.distanceMeters / 1000).toFixed(1)} km`}
                      </Text>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isSelected ? colors.accent : colors.mutedForeground}
                      />
                    </Pressable>
                  );
                })}

                {selectedPub ? (
                  <View style={[styles.selectedPubCard, { borderTopColor: colors.border }]}>
                    <Text style={[styles.selectedLabel, { color: colors.accent }]}>SELECTED PUB</Text>
                    <Text style={[styles.pubName, { color: colors.foreground }]}>{selectedPub.name}</Text>
                    <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                      {selectedPub.address || 'Address unavailable'}
                    </Text>
                  </View>
                ) : null}
              </Card>
            </ScrollView>

            <View style={styles.logReviewFooter}>
              {logError ? <ErrorText>{logError}</ErrorText> : null}
              {logMutation.isPending ? (
                <View style={styles.submissionStatus}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                    Uploading your photo and logging the pint…
                  </Text>
                </View>
              ) : null}
              <Button
                label={
                  logError
                    ? logErrorKind === 'photo'
                      ? 'Retry photo upload'
                      : 'Try logging again'
                    : selectedPub
                      ? 'Log this pint'
                      : 'Log without a pub'
                }
                loading={logMutation.isPending}
                disabled={!pendingPint || isPreparingPint}
                onPress={() => submitPendingPint(selectedPub)}
                testID={logError ? 'retry-log-pint' : 'submit-log-pint'}
              />
              {selectedPub ? (
                <Button
                  label="Log without a pub"
                  variant="quiet"
                  disabled={logMutation.isPending || isPreparingPint}
                  onPress={() => submitPendingPint(null)}
                  testID="submit-log-pint-without-pub"
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(justLoggedPint)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setJustLoggedPint(null)}
      >
        <View style={[styles.modalBackdrop, styles.successBackdrop]}>
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground, opacity: 0.55 }]}
          />
          <View
            style={[
              styles.successSheet,
              {
                backgroundColor: colors.background,
                paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) + 16,
              },
            ]}
          >
            <View style={[styles.successIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="checkmark" size={34} color={colors.accent} />
            </View>
            <Text style={[styles.successKicker, { color: colors.accent }]}>PINT LOGGED</Text>
            <Text style={[styles.successPoints, { color: colors.foreground }]}>
              +{CURRENT_LEAGUE_SCORING.pointsPerValidPint} POINT
            </Text>
            <Text style={[styles.flowBody, { color: colors.mutedForeground }]}>
              {justLoggedPint?.pub
                ? `${justLoggedPint.pub.name} is on the board.`
                : 'Your pint is on the war board.'}
            </Text>
            <View style={styles.successActions}>
              {justLoggedPint?.pub ? (
                <Button
                  label="Review this pub"
                  onPress={() => {
                    const loggedPint = justLoggedPint;
                    if (!loggedPint?.pub) return;
                    setJustLoggedPint(null);
                    router.push({
                      pathname: '/pub/[placeId]',
                      params: {
                        placeId: loggedPint.pub.placeId,
                        provider: loggedPint.pub.provider,
                        name: loggedPint.pub.name,
                        address: loggedPint.pub.address,
                        pintLogId: loggedPint.pintLogId,
                      },
                    });
                  }}
                />
              ) : null}
              <Button
                label="Back to the war"
                variant={justLoggedPint?.pub ? 'quiet' : 'primary'}
                onPress={() => setJustLoggedPint(null)}
                testID="pint-logged-done"
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageContent: { paddingTop: 24, gap: 16 },
  loadState: { flex: 1, justifyContent: 'center', gap: 18 },
  loadingCard: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingCopy: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  errorCard: { gap: 16 },
  errorCopy: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  activeWarCard: { gap: 16, padding: 20 },
  activeHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  activeHeaderCopy: { flex: 1, gap: 5 },
  activeWarTitle: { fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 33 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  timePanel: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  timeCopy: { flex: 1, gap: 3 },
  remainingTime: { fontFamily: 'Inter_700Bold', fontSize: 18, lineHeight: 23 },
  standingPanel: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  standingMetric: { flex: 1, alignItems: 'center', gap: 7 },
  standingValue: { fontFamily: 'Inter_700Bold', fontSize: 16, textAlign: 'center' },
  primaryAction: { gap: 8 },
  primaryHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  heading: { gap: 3 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.5 },
  endTime: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  summary: { gap: 12 },
  scoringRules: { gap: 12 },
  scoringRows: { gap: 10 },
  scoringRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  scoringLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },
  scoringValue: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  resultCard: { gap: 7 },
  resultNames: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 28 },
  resultText: { fontFamily: 'Inter_400Regular', lineHeight: 21 },
  resultMeta: { gap: 2, marginTop: 4 },
  summaryLoading: { alignItems: 'center', gap: 10 },
  warStats: { gap: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  statCell: { flexBasis: '28%', flexGrow: 1, gap: 4, minWidth: 80 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 32 },
  statLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  metricLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  leaderCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  leaderIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  leaderCopy: { flex: 1, gap: 4 },
  leaderNames: { fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 22 },
  emptyScoreCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  emptyScoreCopy: { flex: 1, gap: 4 },
  emptyScoreTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, lineHeight: 21 },
  leaderboardSection: { gap: 12 },
  leaderboardCard: { paddingVertical: 8, gap: 2 },
  noPlayers: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  playerRow: { minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9 },
  rankBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rank: { fontFamily: 'Inter_700Bold', fontSize: 14, textAlign: 'center' },
  playerName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  playerStatus: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  pints: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  winnerLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.7 },
  retiredCard: { gap: 8 },
  retiredTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  retiredText: { fontFamily: 'Inter_400Regular', lineHeight: 21 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  pintFlowSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 28,
    gap: 13,
  },
  photoIntroIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  flowKicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4 },
  flowTitle: { fontFamily: 'Inter_700Bold', fontSize: 27, lineHeight: 33 },
  flowBody: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22 },
  pintReviewSheet: {
    maxHeight: '94%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 20,
    gap: 12,
  },
  reviewScroll: { flexShrink: 1 },
  reviewContent: { gap: 14, paddingBottom: 6 },
  pintPhotoPreview: { width: '100%', height: 230, borderRadius: 20 },
  photoReviewActions: { flexDirection: 'row', gap: 10 },
  photoReviewAction: { flex: 1 },
  pubIdentificationCard: { gap: 12, padding: 14 },
  pubIdentificationHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  pubIdentificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pubIdentificationCopy: { flex: 1, gap: 3 },
  pubSearchMessage: { gap: 5 },
  pubResultCopy: { flex: 1, gap: 3 },
  selectedPubCard: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
    marginTop: 3,
    paddingTop: 12,
  },
  logReviewFooter: { gap: 10 },
  submissionStatus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  successBackdrop: { justifyContent: 'center', paddingHorizontal: 20 },
  successSheet: {
    alignItems: 'center',
    borderRadius: 28,
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 34,
  },
  successIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successKicker: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.5 },
  successPoints: { fontFamily: 'Inter_700Bold', fontSize: 34, lineHeight: 42 },
  successActions: { width: '100%', gap: 10, marginTop: 12 },
  pubSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 18,
  },
  pubSheetHeader: { gap: 7 },
  pubSheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  pubSheetSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  pubLoading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 12 },
  pubRow: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pubName: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  pubAddress: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  pubDistance: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  pubEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  selectedLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
});