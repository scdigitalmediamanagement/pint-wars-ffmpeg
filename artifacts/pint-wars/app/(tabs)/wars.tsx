import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Button, Card, Screen, Title, uiStyles } from '@/components/AppUi';
import { getLeagueDashboard, getMyLeagues, getMyProfile } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';
import type { LeagueDashboard, LeagueMembership } from '@/src/types/league';

function formatEndLabel(endsAt: string, status: 'active' | 'completed') {
  const date = new Date(endsAt);
  if (Number.isNaN(date.getTime())) return null;
  const dateLabel = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${status === 'completed' ? 'Ended' : 'Ends'} ${dateLabel} at ${timeLabel}`;
}

function pointsLabel(points: number) {
  return `${points} ${points === 1 ? 'point' : 'points'}`;
}

function leaderboardSummary(members: LeagueMembership[], status: 'active' | 'completed') {
  if (!members.length) return null;
  const sortedMembers = [...members].sort(
    (a, b) => b.points - a.points || a.joined_at.localeCompare(b.joined_at),
  );
  const topScore = sortedMembers[0].points;
  const topMembers = sortedMembers.filter((member) => member.points === topScore);
  const names = topMembers.map((member) => member.display_name).join(', ');

  if (status === 'completed') {
    return topMembers.length === 1
      ? `Winner: ${names} · ${pointsLabel(topScore)}`
      : `Tie: ${names} · ${pointsLabel(topScore)}`;
  }

  return topMembers.length === 1
    ? `Leader: ${names} · ${pointsLabel(topScore)}`
    : `Tied lead: ${names} · ${pointsLabel(topScore)}`;
}

export default function WarsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['my-leagues'], queryFn: getMyLeagues });
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user?.id as string),
    enabled: Boolean(user?.id),
  });
  const freeTrialAvailable = profileQuery.data?.free_trial_used_at === null;
  const dashboardQueries = useQueries({
    queries: (query.data ?? []).map((item) => ({
      queryKey: ['league-dashboard', item.league.id],
      queryFn: () => getLeagueDashboard(item.league.id),
      staleTime: 30_000,
    })),
  });
  const dashboardsByLeagueId = new Map<string, LeagueDashboard>();
  (query.data ?? []).forEach((item, index) => {
    const dashboard = dashboardQueries[index]?.data;
    if (dashboard) dashboardsByLeagueId.set(item.league.id, dashboard);
  });
  const leagues = (query.data ?? []).map((item) => ({
    item,
    dashboard: dashboardsByLeagueId.get(item.league.id),
    league: dashboardsByLeagueId.get(item.league.id)?.league ?? item.league,
  }));
  const activeLeagues = leagues.filter(({ league }) => league.status === 'active');
  const completedLeagues = leagues.filter(({ league }) => league.status === 'completed');

  function renderLeagueCard({
    item,
    dashboard,
    league,
  }: {
    item: (typeof leagues)[number]['item'];
    dashboard: LeagueDashboard | undefined;
    league: (typeof leagues)[number]['league'];
  }) {
    const isCompleted = league.status === 'completed';
    const memberCount = dashboard?.members.length;
    const leaderboard = dashboard ? leaderboardSummary(dashboard.members, league.status) : null;
    const endLabel = formatEndLabel(league.ends_at, league.status);

    return (
      <Pressable
        key={item.membershipId}
        onPress={() => router.push(`/war/${league.id}`)}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <Card style={styles.warCard}>
          <View style={uiStyles.row}>
            <Text style={[styles.status, { color: isCompleted ? colors.mutedForeground : colors.accent }]}>
              {isCompleted ? 'COMPLETE' : 'ACTIVE'}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
              {item.role === 'host' ? 'Host' : 'Player'}
            </Text>
          </View>
          <Text style={[styles.name, { color: colors.foreground }]}>{league.name}</Text>
          <View style={styles.metadata}>
            {memberCount != null ? (
              <Text style={[styles.metadataText, { color: colors.foreground }]}>
                {isCompleted ? 'Final players: ' : ''}
                {memberCount} / {league.capacity} players
              </Text>
            ) : null}
            {leaderboard ? (
              <Text style={[styles.metadataText, { color: colors.foreground }]}>{leaderboard}</Text>
            ) : null}
            {endLabel ? <Text style={[styles.metadataText, { color: colors.mutedForeground }]}>{endLabel}</Text> : null}
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
              {league.capacity}-player {league.is_free ? 'free' : 'paid'} league
            </Text>
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 22, gap: 22 }]} showsVerticalScrollIndicator={false}>
        <Title eyebrow="Your competitions">Pint Wars</Title>
        {profileQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {profileQuery.isError ? (
          <Text style={{ color: colors.destructive }}>Could not check your free-trial entitlement.</Text>
        ) : freeTrialAvailable ? (
          <Button label="Create your free 4-player, 10-day trial" onPress={() => router.push('/war/create')} />
        ) : profileQuery.data ? (
          <Card style={styles.trialCard}>
            <Text style={[styles.trialTitle, { color: colors.foreground }]}>Free trial already used</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
              Each account gets one 4-player, 10-day trial. You can still join paid Pint Wars when they are available.
            </Text>
          </Card>
        ) : null}
        <Button label="Join a war" variant="secondary" onPress={() => router.push('/war/join')} />
        {query.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {query.isError ? <Text style={{ color: colors.destructive }}>Could not load your wars.</Text> : null}
        {activeLeagues.length ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active leagues</Text>
            {activeLeagues.map(renderLeagueCard)}
          </View>
        ) : null}
        {completedLeagues.length ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Completed history</Text>
            {completedLeagues.map(renderLeagueCard)}
          </View>
        ) : null}
        {!query.isLoading && !query.data?.length ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
            Your completed and active wars will show here.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  trialCard: { gap: 8 },
  trialTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  warCard: { gap: 10 },
  status: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.3 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  metadata: { gap: 5 },
  metadataText: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18 },
});