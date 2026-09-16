import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Screen, Title, uiStyles } from '@/components/AppUi';
import { getLeagueDashboard } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

function dayNumber(startsAt: string, endsAt: string, status: string) {
  if (status === 'completed') return 30;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  return Math.max(1, Math.min(30, Math.floor((Math.min(now, end) - start) / 86400000) + 1));
}

export default function LeagueDashboardScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const query = useQuery({
    queryKey: ['league-dashboard', leagueId],
    queryFn: () => getLeagueDashboard(leagueId as string),
    enabled: Boolean(leagueId),
  });

  if (query.isLoading || !query.data) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        <View style={[uiStyles.content, { paddingTop: 40, gap: 16 }]}>
          <Title>Could not load this war</Title>
          <Text style={{ color: colors.destructive }}>{query.error instanceof Error ? query.error.message : 'Try again.'}</Text>
        </View>
      </Screen>
    );
  }

  const { league, members } = query.data;
  const day = dayNumber(league.starts_at, league.ends_at, league.status);
  const sortedMembers = [...members].sort((a, b) => b.pint_total - a.pint_total || a.joined_at.localeCompare(b.joined_at));

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 28, gap: 18 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={[styles.kicker, { color: colors.accent }]}>{league.status === 'active' ? `DAY ${day} / 30` : 'WAR OVER'}</Text>
          <Title>{league.name}</Title>
        </View>
        <Card style={styles.summary}>
          <View style={uiStyles.row}>
            <View>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{members.length}</Text>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>PLAYERS</Text>
            </View>
            <View>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>0</Text>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL PINTS</Text>
            </View>
            <View>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>8</Text>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>MAX PLAYERS</Text>
            </View>
          </View>
        </Card>
        <View style={{ gap: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Leaderboard</Text>
          <Card style={{ paddingVertical: 8 }}>
            {sortedMembers.map((member, index) => {
              const isCurrentUser = member.user_id === user?.id;
              return (
                <View key={member.id} style={[styles.playerRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rank, { color: colors.accent }]}>{index + 1}</Text>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.playerName, { color: colors.foreground }]}>{member.display_name}{isCurrentUser ? '  (you)' : ''}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>{member.role === 'host' ? 'Host' : 'Player'}</Text>
                  </View>
                  <Text style={[styles.pints, { color: colors.foreground }]}>{member.pint_total}</Text>
                </View>
              );
            })}
          </Card>
        </View>
        <Button label="Log Pint" disabled onPress={() => undefined} />
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
          Pint logging is reserved for Stage 2. No points can be added in this stage.
        </Text>
        {members.some((member) => member.user_id === user?.id && member.role === 'host') ? (
          <Pressable onPress={() => router.push({ pathname: '/war/invite', params: { leagueId: league.id } })}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>Manage invites</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 3 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.5 },
  summary: { gap: 12 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  metricLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  playerRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rank: { width: 25, fontFamily: 'Inter_700Bold', fontSize: 18, textAlign: 'center' },
  playerName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  pints: { fontFamily: 'Inter_700Bold', fontSize: 22 },
});