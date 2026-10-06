import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Screen } from '@/components/AppUi';
import { NotificationBell } from '@/components/NotificationBell';
import { getLeagueDashboard, getMyLeagues } from '@/src/lib/league-service';
import type { LeagueDashboard, MyLeague } from '@/src/types/league';
import palette from '@/constants/colors';

const c = palette.dark;
const home = {
  background: '#05080d',
  panel: '#0c1119',
  panelSoft: '#101720',
  line: '#29303b',
  gold: '#ffd12e',
  text: '#f4f2ec',
  muted: '#a3a9b2',
};

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
  if (d > 0) return `${d} ${d === 1 ? 'day' : 'days'} remaining`;
  if (h > 0) return `${h} ${h === 1 ? 'hour' : 'hours'} remaining`;
  return `${Math.max(1, m)} min remaining`;
}

function standing(dashboard: LeagueDashboard, membershipId: string) {
  const members = dashboard.members.filter((m) => m.status !== 'removed');
  const me = members.find((m) => m.id === membershipId);
  if (!me) return null;
  return { rank: 1 + members.filter((m) => m.points > me.points).length, points: me.points, players: members.length };
}

function ordinalRank(rank: number) {
  const lastTwo = rank % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? 'th'
    : rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th';
  return `${rank}${suffix}`;
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
  const memberCount = dash.data?.members.filter((member) => member.status !== 'removed').length;
  const startsAt = new Date(l.starts_at).getTime();
  const endsAt = new Date(l.ends_at).getTime();
  const progress = Number.isFinite(startsAt) && endsAt > startsAt
    ? Math.max(0, Math.min(1, (now - startsAt) / (endsAt - startsAt)))
    : 0;

  return (
    <View style={styles.hero} testID="active-pint-war">
      <Image
        source={require('@/assets/images/home/pw-home-pints.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
        accessible={false}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(5,8,13,0.11)', 'rgba(5,8,13,0.22)', 'rgba(5,8,13,0.68)', 'rgba(5,8,13,0.98)']}
        locations={[0, 0.32, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(5,8,13,0.72)', 'rgba(5,8,13,0.25)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroContent}>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.live}>LIVE PINT WAR</Text>
        </View>
        <Text style={styles.heroName} numberOfLines={1}>{l.name}</Text>
        <Text style={styles.heroMeta}>
          Day {dayNumber(l.starts_at, l.ends_at, now)} of {total}
          <Text style={styles.metaDivider}>  ·  </Text>
          {memberCount == null ? '—' : memberCount} {memberCount === 1 ? 'player' : 'players'}
        </Text>
        <View style={styles.heroSpacer} />
        {st ? (
          <View style={styles.standings}>
            <Stat label="YOUR POSITION" value={ordinalRank(st.rank)} />
            <Stat label="YOUR SCORE" value={String(st.points)} emphasis />
          </View>
        ) : dash.isError ? (
          <View style={styles.unavail}>
            <Text style={styles.unavailText}>Standings unavailable right now.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry loading standings"
              onPress={() => dash.refetch()}
              style={styles.retry}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.standings}>
            <View style={styles.stat}><View style={styles.skeleton} /></View>
            <View style={styles.stat}><View style={styles.skeleton} /></View>
          </View>
        )}
        {dash.data && !st ? (
          <Text style={styles.unavailText}>Your standing is unavailable for this war.</Text>
        ) : null}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.remaining}>{remaining(l.ends_at, now)}</Text>
      <Pressable
        testID="view-pint-war"
        accessibilityRole="button"
        accessibilityLabel={`View ${l.name} Pint War`}
        onPress={() => router.push(`/war/${id}`)}
        style={({ pressed }) => [styles.heroBtn, { opacity: pressed ? 0.8 : 1 }]}
      >
          <Text style={styles.heroBtnText}>View Pint War</Text>
          <Feather name="arrow-right" size={19} color="#17140a" />
      </Pressable>
      </View>
    </View>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, emphasis && styles.statEmphasis]}>{value}</Text>
    </View>
  );
}

function Action({ icon, label, sub, href, primary }: { icon: keyof typeof Feather.glyphMap; label: string; sub: string; href: '/war/create' | '/war/join'; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, { opacity: pressed ? 0.78 : 1 }]}
    >
      <View style={styles.actionIcon}>
        <Feather name={icon} size={23} color={home.text} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionSub}>{sub}</Text>
      </View>
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

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  return (
    <Screen style={{ backgroundColor: home.background }}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(webTopInset, insets.top + 8), paddingBottom: Math.max(124, insets.bottom + 100) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={home.gold} colors={[home.gold]} />}
      >
        {Platform.OS === 'web' ? (
          <View pointerEvents="none" style={styles.webStatusBar}>
            <Text style={styles.webStatusTime}>9:41</Text>
            <View style={styles.webStatusIcons}>
              <Feather name="signal" size={13} color={home.text} />
              <Feather name="wifi" size={13} color={home.text} />
              <Feather name="battery" size={16} color={home.text} />
            </View>
          </View>
        ) : null}
        <View style={styles.headerRow}>
          <View style={styles.brandRow} accessible accessibilityLabel="Pint Wars">
            <Image
              source={require('@/assets/images/home/pw-reference-crest.png')}
              style={styles.crest}
              resizeMode="contain"
              accessible={false}
            />
            <Image
              source={require('@/assets/images/home/pw-reference-wordmark.png')}
              style={styles.wordmark}
              resizeMode="contain"
              accessible={false}
            />
          </View>
          <View style={styles.bellWrap}>
            <NotificationBell />
          </View>
        </View>
        <Text style={styles.title}>Ready for your next war?</Text>

        {query.isLoading ? (
          <View style={[styles.emptyHero, styles.loadingHero]}>
            <ActivityIndicator color={home.gold} />
          </View>
        ) : query.isError ? (
          <View style={[styles.emptyHero, styles.errorHero]} testID="home-load-error">
            <Text style={styles.emptyStamp}>WARS UNAVAILABLE</Text>
            <Text style={styles.emptyTitle}>We couldn’t load your wars.</Text>
            <Text style={styles.emptyBody}>Check your connection and try again.</Text>
            <Pressable accessibilityRole="button" onPress={refresh} style={styles.heroBtn}>
              <Text style={styles.heroBtnText}>Try Again</Text>
              <Feather name="refresh-cw" size={17} color="#17140a" />
            </Pressable>
          </View>
        ) : activeLeague ? (
          <Hero item={activeLeague} now={now} />
        ) : (
          <View style={styles.emptyHero} testID="no-active-pint-war">
            <Image
              source={require('@/assets/images/home/pw-home-pints.jpg')}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              accessible={false}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(5,8,13,0.06)', 'rgba(5,8,13,0.2)', 'rgba(5,8,13,0.76)', '#05080d']}
              locations={[0, 0.32, 0.65, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.emptyContent}>
              <View style={styles.emptyStampRow}>
                <Feather name="shield" size={13} color={home.gold} />
                <Text style={styles.emptyStamp}>NO ACTIVE PINT WAR</Text>
              </View>
              <View style={styles.heroSpacer} />
              <Text style={styles.emptyTitle}>The pub is calling.</Text>
              <Text style={styles.emptyBody}>
                Bring your mates together, visit local pubs and see who comes out on top.
              </Text>
              <Pressable
                testID="start-pint-war"
                accessibilityRole="button"
                onPress={() => router.push('/war/create')}
                style={({ pressed }) => [styles.heroBtn, styles.emptyCta, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={styles.heroBtnText}>Start a Pint War</Text>
                <Feather name="arrow-right" size={19} color="#17140a" />
              </Pressable>
            </View>
          </View>
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
