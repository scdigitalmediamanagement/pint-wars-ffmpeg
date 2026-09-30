import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ErrorText, Screen, uiStyles } from '@/components/AppUi';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/providers/AuthProvider';
import { getLeagueDashboard, getLeagueSummary } from '@/src/lib/league-service';
import type { LeagueSummary } from '@/src/types/league';
import { WarActivityFeed } from '@/src/components/WarActivityFeed';

function completedDurationDays(
  startsAt: string,
  completedAt: string | null,
  scheduledEndAt: string,
) {
  const start = new Date(startsAt).getTime();
  const end = new Date(completedAt ?? scheduledEndAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

function completedDateLabel(value: string | null) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function MemoriesError({
  title,
  onRetry,
  isRetrying,
}: {
  title: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const colors = useColors();
  return (
    <Card style={styles.stateCard}>
      <Ionicons name="cloud-offline-outline" size={28} color={colors.accent} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Your Pint War results are unchanged. Try loading Memories again.
      </Text>
      <Button
        label="Try again"
        onPress={onRetry}
        loading={isRetrying}
        disabled={isRetrying}
        testID="retry-pint-war-memories"
      />
    </Card>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const colors = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function FinalLeaderboard({ summary }: { summary: LeagueSummary }) {
  const colors = useColors();
  const leaderboard = [...summary.leaderboard].sort(
    (left, right) => right.points - left.points || left.joined_at.localeCompare(right.joined_at),
  );
  let previousPoints: number | null = null;
  let currentRank = 0;

  return (
    <Card style={styles.leaderboardCard}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.muted }]}>
          <Ionicons name="podium-outline" size={20} color={colors.accent} />
        </View>
        <View style={styles.sectionHeading}>
          <Text style={[styles.kicker, { color: colors.accent }]}>FINAL RESULTS</Text>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Final leaderboard</Text>
        </View>
      </View>

      {!leaderboard.length ? (
        <Text style={[styles.body, { color: colors.mutedForeground }]}>No players are available in the final results.</Text>
      ) : leaderboard.map((member, index) => {
        if (previousPoints !== member.points) currentRank = index + 1;
        previousPoints = member.points;
        const isWinner = leaderboard[0].points > 0 && member.points === leaderboard[0].points;
        return (
          <View
            key={member.id}
            style={[
              styles.playerRow,
              { borderBottomColor: colors.border },
              index === leaderboard.length - 1 ? styles.lastPlayerRow : null,
            ]}
          >
            <View style={[styles.rankBadge, { backgroundColor: isWinner ? colors.primary : colors.muted }]}>
              <Text style={[styles.rankText, { color: isWinner ? colors.primaryForeground : colors.accent }]}>
                {currentRank}
              </Text>
            </View>
            <View style={styles.playerCopy}>
              <Text style={[styles.playerName, { color: colors.foreground }]} numberOfLines={1}>
                {member.display_name}
              </Text>
              <Text style={[styles.playerRole, { color: colors.mutedForeground }]}>
                {isWinner ? (leaderboard.filter((row) => row.points === leaderboard[0].points).length > 1 ? 'Tied winner' : 'Winner') : member.role === 'host' ? 'Host' : member.status === 'retired' ? 'Retired' : 'Player'}
              </Text>
            </View>
            <Text style={[styles.points, { color: colors.foreground }]}>
              {member.points} {member.points === 1 ? 'pt' : 'pts'}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

export default function PintWarMemoriesScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const dashboardQuery = useQuery({
    queryKey: ['league-memories-dashboard', user?.id, leagueId],
    queryFn: () => getLeagueDashboard(leagueId),
    enabled: Boolean(user && leagueId),
  });
  const summaryQuery = useQuery({
    queryKey: ['league-memories-summary', user?.id, leagueId],
    queryFn: () => getLeagueSummary(leagueId),
    enabled: Boolean(user && leagueId && dashboardQuery.data?.league.status === 'completed'),
  });

  if (!leagueId) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Pint War Memories', headerBackTitle: 'Back' }} />
        <View style={uiStyles.content}><ErrorText>This Pint War could not be identified.</ErrorText></View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Pint War Memories', headerBackTitle: 'Back' }} />
        <View style={uiStyles.content}>
          <Card style={styles.stateCard}>
            <Ionicons name="lock-closed-outline" size={28} color={colors.accent} />
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>Sign in to view Memories</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Pint War Memories and proof photos are available only to members of that Pint War.
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  if (dashboardQuery.isLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Pint War Memories', headerBackTitle: 'Back' }} />
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Gathering the final results…</Text>
        </View>
      </Screen>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Pint War Memories', headerBackTitle: 'Back' }} />
        <View style={uiStyles.content}>
          <MemoriesError
            title="Could not load this Pint War"
            onRetry={() => void dashboardQuery.refetch()}
            isRetrying={dashboardQuery.isFetching}
          />
        </View>
      </Screen>
    );
  }

  const { league } = dashboardQuery.data;

  if (league.status !== 'completed') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Pint War Memories', headerBackTitle: 'Back' }} />
        <View style={uiStyles.content}>
          <Card style={styles.stateCard}>
            <Ionicons name="time-outline" size={28} color={colors.accent} />
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>Memories unlock when the war is complete</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>
              Come back after the final Pint War results are recorded.
            </Text>
          </Card>
        </View>
      </Screen>
    );
  }

  if (summaryQuery.isLoading || !summaryQuery.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Pint War Memories', headerBackTitle: 'Back' }} />
        <ScrollView contentContainerStyle={[uiStyles.content, styles.pageContent]}>
          {summaryQuery.isError ? (
            <MemoriesError
              title="The final summary is unavailable"
              onRetry={() => void summaryQuery.refetch()}
              isRetrying={summaryQuery.isFetching}
            />
          ) : (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={[styles.body, { color: colors.mutedForeground }]}>Gathering the final results…</Text>
            </View>
          )}
        </ScrollView>
      </Screen>
    );
  }

  const summary = summaryQuery.data;
  const duration = completedDurationDays(league.starts_at, league.completed_at, league.ends_at);
  const leaderboard = [...summary.leaderboard].sort(
    (left, right) => right.points - left.points || left.joined_at.localeCompare(right.joined_at),
  );
  const highestScore = leaderboard[0]?.points ?? 0;
  const winners = highestScore > 0
    ? leaderboard.filter((member) => member.points === highestScore)
    : [];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Pint War Memories', headerBackTitle: 'Back' }} />
      <ScrollView
        contentContainerStyle={[uiStyles.content, styles.pageContent]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(500)}>
          <Card style={[styles.heroCard, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
            <View style={styles.heroTopline}>
              <View style={[styles.heroIcon, { backgroundColor: colors.primaryForeground }]}>
                <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
              </View>
              <Text style={[styles.heroKicker, { color: colors.accent }]}>PINT WAR MEMORIES</Text>
            </View>
            <Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>{league.name}</Text>
            <Text style={[styles.heroCopy, { color: colors.primaryForeground }]}>
              The final results and recorded moments from your Pint War.
            </Text>
            <Text style={[styles.heroDate, { color: colors.primaryForeground }]}>
              Completed {completedDateLabel(league.completed_at)}
            </Text>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(90).duration(500)} style={styles.statsSection}>
          <View style={styles.statsRow}>
            <Stat label="PLAYERS" value={summary.stats.player_count} icon="people-outline" />
            <Stat label="DAYS" value={duration ?? '—'} icon="calendar-outline" />
            <Stat label="PINTS" value={summary.stats.total_pints} icon="beer-outline" />
          </View>
          <View style={styles.statsRow}>
            <Stat label="QUALIFYING REVIEWS" value={summary.stats.reviews} icon="star-outline" />
            <Stat label="PUBS VISITED" value={summary.stats.pubs_visited} icon="location-outline" />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(500)}>
          <Card style={[styles.winnerCard, { borderColor: colors.accent }]}>
            <View style={[styles.winnerIcon, { backgroundColor: colors.muted }]}>
              <Ionicons name="trophy-outline" size={24} color={colors.accent} />
            </View>
            <View style={styles.winnerCopy}>
              <Text style={[styles.kicker, { color: colors.accent }]}>
                {!winners.length ? 'WAR COMPLETE' : winners.length === 1 ? 'WINNER' : 'TIED WINNERS'}
              </Text>
              <Text style={[styles.winnerNames, { color: colors.foreground }]}>
                {winners.length ? winners.map((winner) => winner.display_name).join(' · ') : 'No score events recorded'}
              </Text>
              {winners.length ? (
                <Text style={[styles.body, { color: colors.mutedForeground }]}>
                  {highestScore} {highestScore === 1 ? 'point' : 'points'}
                </Text>
              ) : null}
            </View>
          </Card>
        </Animated.View>

        <FinalLeaderboard summary={summary} />

        <WarActivityFeed
          leagueId={league.id}
          currentUserId={user.id}
          presentation="memories"
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageContent: { gap: 20, paddingTop: 20, paddingBottom: 36 },
  heroCard: { gap: 15, padding: 24, borderRadius: 24 },
  heroTopline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  heroKicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.7 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 31, lineHeight: 37 },
  heroCopy: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22, opacity: 0.82 },
  heroDate: { fontFamily: 'Inter_600SemiBold', fontSize: 12, opacity: 0.8, marginTop: 2 },
  statsSection: { gap: 10 },
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    minHeight: 108,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 25, lineHeight: 29 },
  statLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8, textAlign: 'center' },
  winnerCard: { flexDirection: 'row', alignItems: 'center', gap: 15, borderWidth: 1, padding: 20 },
  winnerIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  winnerCopy: { flex: 1, gap: 5 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4 },
  winnerNames: { fontFamily: 'Inter_700Bold', fontSize: 21, lineHeight: 27 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  leaderboardCard: { gap: 0, paddingVertical: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  sectionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { flex: 1, gap: 3 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  playerRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 9 },
  lastPlayerRow: { borderBottomWidth: 0 },
  rankBadge: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  playerCopy: { flex: 1, gap: 2 },
  playerName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  playerRole: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  points: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  stateCard: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, textAlign: 'center' },
  loadingState: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
});