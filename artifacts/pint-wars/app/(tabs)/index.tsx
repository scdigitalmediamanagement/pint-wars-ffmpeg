import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Screen, uiStyles } from '@/components/AppUi';
import { NotificationBell } from '@/components/NotificationBell';
import { getLeagueDashboard, getMyLeagues } from '@/src/lib/league-service';
import type { LeagueDashboard, MyLeague } from '@/src/types/league';
import palette from '@/constants/colors';
import { useColors } from '@/hooks/useColors';

const c = palette.dark;

function durationDays(startsAt: string, endsAt: string) {
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  return Math.max(1, Math.ceil((e - s) / 86400000));
}

function dayNumber(startsAt: string, endsAt: string, now: number) {
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  const total = durationDays(startsAt, endsAt);
  return Math.max(1, Math.min(total, Math.floor((Math.min(now, e) - s) / 86400000) + 1));
}

function remaining(endsAt: string, now: number) {
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return 'End time unavailable';
  const ms = end - now;
  if (ms <= 0) return 'Time limit reached';
  const total = Math.floor(ms / 60_000);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d}d ${h}h remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${Math.max(1, m)}m remaining`;
}

function standing(dashboard: LeagueDashboard, membershipId: string) {
  const members = dashboard.members.filter((m) => m.status !== 'removed');
  const me = members.find((m) => m.id === membershipId);
  if (!me) return null;
  return { rank: 1 + members.filter((m) => m.points > me.points).length, points: me.points, players: members.length };
}

function Hero({ item, now }: { item: MyLeague; now: number }) {
  const id = item.league.id;
  const dash = useQuery({
    queryKey: ['league-dashboard', id],
    queryFn: () => getLeagueDashboard(id),
    enabled: true,
    refetchInterval: 60_000,
  });
  const st = dash.data ? standing(dash.data, item.membershipId) : null;
  const l = item.league;
  const total = durationDays(l.starts_at, l.ends_at);

  return (
    <View style={styles.hero}>
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.live}>LIVE PINT WAR</Text>
      </View>
      <Text style={styles.heroName} numberOfLines={2}>{l.name}</Text>
      <Text style={styles.heroMeta}>
        Day {dayNumber(l.starts_at, l.ends_at, now)} of {total}  ·  {remaining(l.ends_at, now)}
      </Text>
      {st ? (
        <View style={styles.statRow}>
          <Stat label="RANK" value={`#${st.rank}`} />
          <Stat label="SCORE" value={String(st.points)} />
          <Stat label="PLAYERS" value={String(st.players)} />
        </View>
      ) : dash.isError ? (
        <View style={styles.unavail}>
          <Text style={styles.unavailText}>Standings unavailable right now.</Text>
          <Pressable accessibilityRole="button" onPress={() => dash.refetch()} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : dash.data ? (
        <Text style={styles.unavailText}>Your standing is unavailable for this war.</Text>
      ) : (
        <View style={styles.statRow}>
          {[0, 1, 2].map((i) => <View key={i} style={styles.skeleton} />)}
        </View>
      )}
      <Pressable
        testID="view-pint-war"
        accessibilityRole="button"
        onPress={() => router.push(`/war/${id}`)}
        style={({ pressed }) => [styles.heroBtn, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={styles.heroBtnText}>VIEW PINT WAR</Text>
        <Feather name="arrow-right" size={18} color={c.accentForeground} />
      </Pressable>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Action({ icon, label, sub, href, primary }: { icon: keyof typeof Feather.glyphMap; label: string; sub: string; href: '/war/create' | '/war/join'; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, { opacity: pressed ? 0.8 : 1 }]}
    >
      <Feather name={icon} size={22} color={c.accent} />
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionSub}>{sub}</Text>
    </Pressable>
  );
}

function statusLabel(item: MyLeague) {
  if (item.membershipStatus === 'removed') return 'REMOVED';
  if (item.membershipStatus === 'retired') return 'RETIRED';
  return item.league.status === 'active' ? 'LIVE' : 'COMPLETED';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const deviceColors = useColors();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({ queryKey: ['my-leagues'], queryFn: getMyLeagues, refetchInterval: 60_000 });
  const leagues = query.data ?? [];
  const activeLeague = leagues.find((i) => i.league.status === 'active' && i.membershipStatus === 'active');
  const activeLeagueId = activeLeague?.league.id;
  const refetch = useCallback(async () => {
    await Promise.all([
      query.refetch(),
      activeLeagueId
        ? queryClient.refetchQueries({ queryKey: ['league-dashboard', activeLeagueId], exact: true, type: 'active' })
        : Promise.resolve(),
    ]);
  }, [query.refetch, queryClient, activeLeagueId]);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const refresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setNow(Date.now());
        refetchRef.current();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      refetchRef.current();
    }, []),
  );

  return (
    <Screen style={{ backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={[uiStyles.content, { paddingTop: Math.max(22, insets.top + 8), paddingBottom: Math.max(104, insets.bottom + 88), gap: 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}
      >
        <View style={styles.headerRow}>
          <View style={styles.greeting}>
            <View style={styles.brandRow}>
              <Feather name="flag" size={13} color={c.accent} />
              <Text style={styles.brand}>PINT WARS</Text>
            </View>
            <Text style={styles.title}>Ready for your next war?</Text>
          </View>
          <View style={[styles.bellWrap, { backgroundColor: deviceColors.card }]}>
            <NotificationBell />
          </View>
        </View>

        {query.isLoading ? (
          <View style={[styles.hero, { alignItems: 'center', minHeight: 200, justifyContent: 'center' }]}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : query.isError ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Could not load your wars</Text>
            <Pressable accessibilityRole="button" onPress={refresh} style={styles.retry}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </Card>
        ) : activeLeague ? (
          <Hero item={activeLeague} now={now} />
        ) : (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>No live war right now</Text>
            <Text style={styles.body}>Start one with your friends or join with an invite code.</Text>
          </Card>
        )}

        <View style={{ gap: 12 }}>
          <Text style={styles.section}>QUICK ACTIONS</Text>
          <View style={styles.actions}>
            <Action primary icon="plus-circle" label="Create a Pint War" sub="Start with friends" href="/war/create" />
            <Action icon="log-in" label="Join a Pint War" sub="Use an invite code" href="/war/join" />
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Text style={styles.section}>YOUR PINT WARS</Text>
          {leagues.length === 0 && !query.isLoading ? (
            <Card style={styles.card}>
              <Text style={styles.body}>{query.isError ? 'Your wars are unavailable.' : 'You have not joined any Pint Wars yet.'}</Text>
            </Card>
          ) : (
            leagues.map((item) => (
              <Pressable
                key={item.membershipId}
                accessibilityRole="button"
                disabled={item.membershipStatus === 'removed'}
                accessibilityState={{ disabled: item.membershipStatus === 'removed' }}
                onPress={() => router.push(`/war/${item.league.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <Card style={styles.listCard}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.league.name}</Text>
                    <Text style={styles.body}>{item.role === 'host' ? 'Host' : 'Player'}</Text>
                  </View>
                  <Text style={[styles.badge, statusLabel(item) === 'LIVE' && { color: c.accent }]}>{statusLabel(item)}</Text>
                  {item.membershipStatus !== 'removed' ? <Feather name="chevron-right" size={18} color={c.mutedForeground} /> : null}
                </Card>
              </Pressable>
            ))
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/passport')}
          style={({ pressed }) => [styles.discover, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Feather name="compass" size={22} color={c.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.section}>DISCOVER A NEW PUB</Text>
            <Text style={styles.body}>Find pubs you haven’t visited yet.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={c.mutedForeground} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  greeting: { flex: 1, gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brand: { color: c.accent, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 2.2 },
  title: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 37 },
  bellWrap: { borderRadius: 16 },
  hero: { backgroundColor: c.card, borderColor: c.accent, borderWidth: 1, borderRadius: 28, padding: 22, gap: 14, shadowColor: c.background, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 4 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.accent },
  live: { color: c.accent, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.6 },
  heroName: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 30, lineHeight: 35 },
  heroMeta: { color: c.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 14 },
  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: c.background, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
  statValue: { color: c.accent, fontFamily: 'Inter_700Bold', fontSize: 26 },
  statLabel: { color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  skeleton: { flex: 1, height: 66, borderRadius: 16, backgroundColor: c.muted },
  unavail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  unavailText: { color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14 },
  retry: { borderColor: c.accent, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, alignSelf: 'flex-start' },
  retryText: { color: c.accent, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  heroBtn: { minHeight: 54, borderRadius: 16, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  heroBtnText: { color: c.accentForeground, fontFamily: 'Inter_700Bold', fontSize: 15, letterSpacing: 1 },
  card: { backgroundColor: c.card, borderColor: c.border, gap: 12 },
  cardTitle: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 },
  body: { color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  section: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.5 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, minHeight: 124, borderRadius: 22, padding: 16, gap: 6, justifyContent: 'flex-end', backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  actionPrimary: { backgroundColor: c.secondary, borderColor: c.border },
  actionLabel: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 16 },
  actionSub: { color: c.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 },
  listCard: { backgroundColor: c.card, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  badge: { color: c.mutedForeground, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.1 },
  discover: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.muted },
});
