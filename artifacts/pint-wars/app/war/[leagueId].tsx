import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { getGetPintWarActivityQueryKey } from '@workspace/api-client-react';
import { Button, Card, ErrorText, Screen, Title, uiStyles } from '@/components/AppUi';
import { WarActivityFeed } from '@/src/components/WarActivityFeed';
import { endLeagueEarly, getLeagueDashboard, getLeagueSummary, logPint, retireFromLeague } from '@/src/lib/league-service';
import { getCurrentLocation } from '@/src/lib/location-service';
import { findNearbyPubs, type Coordinates, type NearbyPub } from '@/src/lib/pub-service';
import { CURRENT_LEAGUE_SCORING, type LeaguePoints } from '@/src/types/league';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

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
  latitude: number | null;
  longitude: number | null;
  location: Coordinates;
};

type JustLoggedPub = {
  pub: NearbyPub;
  pintLogId: string;
};

export default function LeagueDashboardScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [cameraError, setCameraError] = useState('');
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [logError, setLogError] = useState('');
  const [isPreparingPint, setIsPreparingPint] = useState(false);
  const [pubPickerVisible, setPubPickerVisible] = useState(false);
  const [isSearchingPubs, setIsSearchingPubs] = useState(false);
  const [nearbyPubs, setNearbyPubs] = useState<NearbyPub[]>([]);
  const [selectedPub, setSelectedPub] = useState<NearbyPub | null>(null);
  const [nearbyPubMessage, setNearbyPubMessage] = useState('');
  const [pendingPint, setPendingPint] = useState<PendingPint | null>(null);
  const [justLoggedPub, setJustLoggedPub] = useState<JustLoggedPub | null>(null);
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

      if (variables.pub) {
          setJustLoggedPub({
            pub: variables.pub,
            pintLogId: result.pintLogId,
          });
      }
    },
    onError: (error) => {
      setIsPreparingPint(false);
      setLogError(error instanceof Error ? error.message : 'The pint could not be logged. Try again.');
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

  function continueWithPintLog(
    pint: Omit<PendingPint, 'location'>,
    pub: NearbyPub | null,
  ) {
    setPubPickerVisible(false);
    setPendingPint(null);
    setSelectedPub(null);
    setIsPreparingPint(true);
    logMutation.mutate({ ...pint, pub });
  }

  function continueWithoutPub() {
    if (!pendingPint) return;
    const { location: _location, ...pint } = pendingPint;
    continueWithPintLog(pint, null);
  }

  function confirmSelectedPub() {
    if (!pendingPint || !selectedPub) return;
    const { location: _location, ...pint } = pendingPint;
    continueWithPintLog(pint, selectedPub);
  }

  async function getOptionalLocation(): Promise<Coordinates | null> {
    const result = await getCurrentLocation();
    return result.status === 'success' ? result.coordinates : null;
  }

  async function takePintPhoto() {
    setIsPreparingPint(true);
    setCameraError('');
    setCameraBlocked(false);
    setLogError('');

    let permission: ImagePicker.PermissionResponse;
    try {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    } catch {
      setIsPreparingPint(false);
      setCameraError('The camera could not be opened. Please try again.');
      return;
    }
    if (!permission.granted) {
      setCameraBlocked(!permission.canAskAgain);
      setCameraError(
        permission.canAskAgain
          ? 'Camera access is required to photograph your fresh pint. Tap “Try camera again” to retry.'
          : 'Camera access is turned off. Enable it in your device settings, then try again.',
      );
      setIsPreparingPint(false);
      return;
    }

    let photo: ImagePicker.ImagePickerResult;
    try {
      photo = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });
    } catch {
      setIsPreparingPint(false);
      setCameraError('The camera could not take a photo. Please try again.');
      return;
    }
    if (photo.canceled || !photo.assets[0]) {
      setIsPreparingPint(false);
      return;
    }

    const capturedPhoto = {
      photoUri: photo.assets[0].uri,
      mimeType: photo.assets[0].mimeType ?? null,
    };

    let location: Coordinates | null = null;
    try {
      location = await getOptionalLocation();
    } catch {
      location = null;
    }

    if (!location) {
      setIsPreparingPint(false);
      continueWithPintLog({
        ...capturedPhoto,
        latitude: null,
        longitude: null,
      }, null);
      return;
    }

    const nextPendingPint = {
      ...capturedPhoto,
      latitude: location.latitude,
      longitude: location.longitude,
      location,
    };
    setPendingPint(nextPendingPint);
    setNearbyPubs([]);
    setSelectedPub(null);
    setNearbyPubMessage('');
    setPubPickerVisible(true);
    setIsSearchingPubs(true);

    try {
      const search = await findNearbyPubs(location);
      setNearbyPubs(search.pubs);
      if (!search.providerConfigured) {
        setNearbyPubMessage('Nearby pub search will appear here when a places provider is connected.');
      } else if (!search.pubs.length) {
        setNearbyPubMessage('No nearby pubs were found. You can continue without selecting one.');
      }
    } catch {
      setNearbyPubMessage('Nearby pubs could not be loaded. You can continue without selecting one.');
    } finally {
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
  const leaders = hasScores
    ? sortedMembers.filter((member) => member.points === highestPoints)
    : [];
  const currentStanding = rankedMembers.find((entry) => entry.member.user_id === user?.id);
  const winners = hasScores
    ? sortedMembers.filter((member) => member.points === highestPoints)
    : [];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[uiStyles.content, styles.pageContent]}
        showsVerticalScrollIndicator={false}
      >
        {league.status === 'active' ? (
          <Card style={styles.activeWarCard}>
            <View style={styles.activeHeaderRow}>
              <View style={styles.activeHeaderCopy}>
                <Text style={[styles.kicker, { color: colors.accent }]}>
                  DAY {day} OF {durationDays}
                </Text>
                <Text style={[styles.activeWarTitle, { color: colors.foreground }]}>
                  {league.name}
                </Text>
              </View>
              <View style={[styles.liveBadge, { backgroundColor: colors.muted }]}>
                <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.liveLabel, { color: colors.accent }]}>LIVE</Text>
              </View>
            </View>

            <View style={[styles.timePanel, { backgroundColor: colors.muted }]}>
              <Ionicons name="time-outline" size={23} color={colors.accent} />
              <View style={styles.timeCopy}>
                <Text style={[styles.remainingTime, { color: colors.foreground }]}>
                  {remainingLabel}
                </Text>
                <Text style={[styles.endTime, { color: colors.mutedForeground }]}>
                  {leagueEndLabel ?? 'End date unavailable'}
                </Text>
              </View>
            </View>

            <View style={[styles.standingPanel, { borderTopColor: colors.border }]}>
              <View style={styles.standingMetric}>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>YOUR PLACE</Text>
                <Text style={[styles.standingValue, { color: colors.foreground }]}>
                  {!hasScores
                    ? '—'
                    : currentStanding
                      ? `${currentStanding.isTied ? 'Tied ' : ''}${rankOrdinal(currentStanding.rank)}`
                      : '—'}
                </Text>
              </View>
              <View style={styles.standingMetric}>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>YOUR SCORE</Text>
                <Text style={[styles.standingValue, { color: colors.foreground }]}>
                  {currentMembership
                    ? `${currentMembership.points} ${currentMembership.points === 1 ? 'pt' : 'pts'}`
                    : '—'}
                </Text>
              </View>
              <View style={styles.standingMetric}>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>PLAYERS</Text>
                <Text style={[styles.standingValue, { color: colors.foreground }]}>
                  {members.length}/{league.capacity}
                </Text>
              </View>
            </View>
          </Card>
        ) : (
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
        )}

        {league.status === 'active' && !isCurrentUserRetired ? (
          <View style={styles.primaryAction}>
            <Button
              label={cameraError ? 'Try camera again' : 'Log a Pint'}
              loading={isPreparingPint || logMutation.isPending}
              onPress={() => void takePintPhoto()}
              testID="log-a-pint"
            />
            <Text style={[styles.primaryHint, { color: colors.mutedForeground }]}>
              Take a fresh photo to log your pint.
            </Text>
            {cameraError ? <ErrorText>{cameraError}</ErrorText> : null}
            {cameraBlocked && Platform.OS !== 'web' ? (
              <Button
                label="Open device settings"
                variant="quiet"
                onPress={() => {
                  void Linking.openSettings().catch(() => {
                    setCameraError('Open your device settings and allow camera access for Pint Wars.');
                  });
                }}
              />
            ) : null}
            {logError ? <ErrorText>{logError}</ErrorText> : null}
          </View>
        ) : null}

        {league.status === 'active' && isCurrentUserRetired ? (
          <Card style={styles.retiredCard}>
            <Text style={[styles.retiredTitle, { color: colors.foreground }]}>Retired from this Pint War</Text>
            <Text style={[styles.retiredText, { color: colors.mutedForeground }]}>
              Your existing points remain visible, but you cannot log more pints or earn more points in this league.
            </Text>
          </Card>
        ) : null}

        {league.status === 'active' ? (
          <Card style={styles.scoringRules}>
            <Text style={[styles.selectedLabel, { color: colors.accent }]}>HOW POINTS WORK</Text>
            <View style={styles.scoringRows}>
              <View style={styles.scoringRow}>
                <Ionicons name="add-circle-outline" size={19} color={colors.accent} />
                <Text style={[styles.scoringLabel, { color: colors.foreground }]}>Pint</Text>
                <Text style={[styles.scoringValue, { color: colors.foreground }]}>
                  +{CURRENT_LEAGUE_SCORING.pointsPerValidPint} point
                </Text>
              </View>
              <View style={styles.scoringRow}>
                <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.accent} />
                <Text style={[styles.scoringLabel, { color: colors.foreground }]}>Qualifying pub review</Text>
                <Text style={[styles.scoringValue, { color: colors.foreground }]}>
                  +{CURRENT_LEAGUE_SCORING.reviewBonusPoints} bonus
                </Text>
              </View>
            </View>
            <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
              A review bonus is earned once per player per pub. Editing a review adds no points; older score events keep their original values.
            </Text>
          </Card>
        ) : null}

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
          </>
        ) : null}

        {league.status === 'active' ? (
          hasScores ? (
            <Card style={styles.leaderCard}>
              <View style={[styles.leaderIcon, { backgroundColor: colors.muted }]}>
                <Ionicons name="trophy-outline" size={22} color={colors.accent} />
              </View>
              <View style={styles.leaderCopy}>
                <Text style={[styles.selectedLabel, { color: colors.accent }]}>
                  {leaders.length > 1 ? 'JOINT LEAD' : 'CURRENT LEADER'}
                </Text>
                <Text style={[styles.leaderNames, { color: colors.foreground }]}>
                  {leaders.map((leader) =>
                    `${leader.display_name}${leader.user_id === user?.id ? ' (you)' : ''}`,
                  ).join(' · ')}
                </Text>
                <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                  {highestPoints} {highestPoints === 1 ? 'point' : 'points'}
                </Text>
              </View>
            </Card>
          ) : (
            <Card style={styles.emptyScoreCard}>
              <Ionicons name="trophy-outline" size={23} color={colors.accent} />
              <View style={styles.emptyScoreCopy}>
                <Text style={[styles.emptyScoreTitle, { color: colors.foreground }]}>
                  The race starts with the first pint
                </Text>
                <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                  No points on the board yet. The leaderboard will update as points are earned.
                </Text>
              </View>
            </Card>
          )
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
        {league.status === 'active' && user ? (
          <WarActivityFeed
            leagueId={league.id}
            currentUserId={user.id}
          />
        ) : null}
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

      <Modal visible={!!justLoggedPub} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground, opacity: 0.45 }]} />
          <View style={[styles.pubSheet, { backgroundColor: colors.background, alignItems: 'center', paddingVertical: 40 }]}>
            <Title>Pint Logged!</Title>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 24, fontSize: 16, lineHeight: 24 }}>
              Your score gained {CURRENT_LEAGUE_SCORING.pointsPerValidPint} point for this pint at {justLoggedPub?.pub.name}.
            </Text>
            <View style={{ width: '100%', gap: 12 }}>
              <Button label="Review this pub" onPress={() => {
                  const loggedPub = justLoggedPub;
                 setJustLoggedPub(null);
                  router.push({
                    pathname: '/pub/[placeId]',
                    params: {
                      placeId: loggedPub!.pub.placeId,
                      provider: loggedPub!.pub.provider,
                      name: loggedPub!.pub.name,
                      address: loggedPub!.pub.address,
                      pintLogId: loggedPub!.pintLogId,
                    },
                  });
              }} />
              <Button label="Done" variant="quiet" onPress={() => setJustLoggedPub(null)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pubPickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={continueWithoutPub}
      >
        <View style={styles.modalBackdrop}>
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground, opacity: 0.45 }]}
          />
          <View style={[styles.pubSheet, { backgroundColor: colors.background }]}>
            <View style={styles.pubSheetHeader}>
              <Text style={[styles.pubSheetTitle, { color: colors.foreground }]}>Choose the pub</Text>
              <Text style={[styles.pubSheetSubtitle, { color: colors.mutedForeground }]}>
                Select a nearby pub, then confirm it before your pint is logged.
              </Text>
            </View>

            {isSearchingPubs ? (
              <View style={styles.pubLoading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                  Finding nearby pubs…
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.pubList}
                contentContainerStyle={styles.pubListContent}
                showsVerticalScrollIndicator={false}
              >
                {nearbyPubs.map((pub) => {
                  const isSelected =
                    selectedPub?.provider === pub.provider &&
                    selectedPub.placeId === pub.placeId;
                  return (
                    <Pressable
                      key={`${pub.provider}:${pub.placeId}`}
                      accessibilityRole="radio"
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
                      <View style={{ flex: 1, gap: 4 }}>
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
                    </Pressable>
                  );
                })}

                {nearbyPubMessage ? (
                  <Card>
                    <Text style={[styles.pubEmptyText, { color: colors.mutedForeground }]}>
                      {nearbyPubMessage}
                    </Text>
                  </Card>
                ) : null}

                {selectedPub ? (
                  <Card style={styles.selectedPubCard}>
                    <Text style={[styles.selectedLabel, { color: colors.accent }]}>SELECTED PUB</Text>
                    <Text style={[styles.pubName, { color: colors.foreground }]}>{selectedPub.name}</Text>
                    <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                      {selectedPub.address}
                    </Text>
                  </Card>
                ) : null}
              </ScrollView>
            )}

            <View style={styles.pubActions}>
              {selectedPub ? (
                <Button
                  label={`Confirm ${selectedPub.name}`}
                  onPress={confirmSelectedPub}
                />
              ) : null}
              <Button
                label="Continue without a pub"
                variant={selectedPub ? 'quiet' : 'secondary'}
                disabled={isSearchingPubs}
                onPress={continueWithoutPub}
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
  pubList: { flexGrow: 0 },
  pubListContent: { gap: 10 },
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
  selectedPubCard: { gap: 5 },
  selectedLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  pubActions: { gap: 10 },
});