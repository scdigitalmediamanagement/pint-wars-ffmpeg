import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Screen } from '@/components/AppUi';
import { NotificationBell } from '@/components/NotificationBell';
import { getLeagueDashboard, getMyLeagues } from '@/src/lib/league-service';
import type { LeagueDashboard, MyLeague } from '@/src/types/league';
import home from '@/constants/homeColors';

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
        style={[StyleSheet.absoluteFill, styles.heroPhoto, styles.activePhoto]}
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
        ) : dash.data ? (
          <Text style={styles.unavailText}>Your standing is unavailable for this war.</Text>
        ) : (
          <View style={styles.standings}>
            <View style={styles.stat}><View style={styles.skeleton} /></View>
            <View style={styles.stat}><View style={styles.skeleton} /></View>
          </View>
        )}
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
              <Feather name="bar-chart" size={13} color={home.text} />
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
            <NotificationBell
              compact
              appearance={{ foreground: home.text, border: home.line, accent: home.gold, accentForeground: home.actionInk }}
            />
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
              style={[StyleSheet.absoluteFill, styles.heroPhoto]}
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

        <View style={styles.quickSection}>
          <Text style={styles.section}>QUICK ACTIONS</Text>
          <View style={styles.actions}>
            <Action primary icon="flag" label="Create a Pint War" sub="Start with friends" href="/war/create" />
            <Action icon="users" label="Join a Pint War" sub="Use an invite code" href="/war/join" />
          </View>
        </View>

        <Pressable
          testID="discover-pubs"
          accessibilityRole="button"
          accessibilityLabel="Discover a new pub"
          onPress={() => router.push('/passport')}
          style={({ pressed }) => [styles.discover, { opacity: pressed ? 0.82 : 1 }]}
        >
          <View style={styles.discoverCopy}>
            <Text style={styles.discoverTitle}>DISCOVER A NEW PUB</Text>
            <Text style={styles.discoverBody}>Find great pubs near you that{'\n'}you haven’t visited yet.</Text>
          </View>
          <View style={styles.mapGraphic} accessible={false}>
            <Svg width="100%" height="100%" viewBox="0 0 105 100" fill="none">
              <Path fill="#19252c" d="M34 0h71v100H0z" />
              <Path stroke="#3c7040" strokeWidth={5} d="m65-8-6 38 45 16M83 4l-6 14 17 10M4 80l28-8 19 26m48-25-24 17" />
              <Path stroke="#6d757b" strokeWidth={1.5} d="m34 10 16 18-5 10-14-3-9 19 17 22 42 18m-2-84-10 30 32 16-9 20-37-9-16 9" />
              <Path fill={home.gold} d="M69 22c-8 0-14 6-14 14 0 11 14 26 14 26s14-15 14-26c0-8-6-14-14-14Z" />
              <Circle cx={69} cy={36} r={5} fill="#19252c" />
              <Path fill="#4bb13b" d="M30 56c-6 0-11 5-11 11 0 8 11 20 11 20s11-12 11-20c0-6-5-11-11-11Z" />
              <Circle cx={30} cy={66} r={4} fill="#19252c" />
            </Svg>
          </View>
        </Pressable>

        <View style={styles.warsSection}>
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
                  <Text style={[styles.badge, statusLabel(item) === 'LIVE' && { color: home.gold }]}>{statusLabel(item)}</Text>
                  {item.membershipStatus !== 'removed' ? <Feather name="chevron-right" size={18} color={home.muted} /> : null}
                </Card>
              </Pressable>
            ))
          )}
        </View>

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollView: { width: '100%' },
  content: { width: '100%', maxWidth: 430, alignSelf: 'center', paddingHorizontal: 19 },
  webStatusBar: { position: 'absolute', top: 11, left: 25, right: 24, height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  webStatusTime: { color: home.text, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  webStatusIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerRow: { height: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 43 },
  crest: { width: 36, height: 40 },
  wordmark: { width: 123, height: 42 },
  bellWrap: { alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: home.panel },
  title: { marginTop: 7, marginBottom: 15, color: home.text, fontFamily: 'Inter_700Bold', fontSize: 25, lineHeight: 31, letterSpacing: -0.45 },
  hero: { minHeight: 308, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,209,46,0.58)', borderRadius: 16, backgroundColor: home.panel },
  heroPhoto: { width: '100%', height: '100%' },
  activePhoto: { transform: [{ scale: 1.22 }, { translateY: -12 }], transformOrigin: '70% 100%' },
  heroContent: { flex: 1, paddingTop: 15, paddingHorizontal: 15, paddingBottom: 13 },
  livePill: { alignSelf: 'flex-start', minHeight: 23, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,209,46,0.35)', backgroundColor: 'rgba(5,8,13,0.74)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: home.gold },
  live: { color: '#fff0b1', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8 },
  heroName: { marginTop: 7, color: home.text, fontFamily: 'Inter_700Bold', fontSize: 26, lineHeight: 31, letterSpacing: -0.5 },
  heroMeta: { marginTop: 5, color: '#e3dfd7', fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  metaDivider: { color: home.gold },
  heroSpacer: { flex: 1, minHeight: 34 },
  standings: { paddingTop: 7, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-end', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.28)' },
  stat: { flex: 1 },
  statLabel: { color: '#dedbd3', fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.6 },
  statValue: { marginTop: 2, color: home.text, fontFamily: 'Inter_700Bold', fontSize: 26, lineHeight: 30 },
  statEmphasis: { color: home.gold },
  skeleton: { height: 29, marginTop: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)' },
  unavail: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  unavailText: { color: home.text, fontFamily: 'Inter_500Medium', fontSize: 12 },
  retry: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: home.gold },
  retryText: { color: home.gold, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  progressTrack: { height: 6, marginTop: 7, overflow: 'hidden', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: home.gold },
  remaining: { marginTop: 5, color: '#dedbd3', fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'right' },
  heroBtn: { minHeight: 49, marginTop: 11, paddingHorizontal: 12, borderRadius: 11, backgroundColor: home.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  heroBtnText: { color: '#17140a', fontFamily: 'Inter_700Bold', fontSize: 16 },
  quickSection: { marginTop: 18 },
  section: { marginBottom: 10, color: home.text, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.9 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, minHeight: 100, paddingHorizontal: 5, paddingVertical: 12, borderWidth: 1, borderColor: home.line, borderRadius: 13, backgroundColor: home.panelSoft, alignItems: 'center', justifyContent: 'center', gap: 10 },
  actionPrimary: { borderColor: home.line },
  actionIcon: { width: 33, height: 33, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.035)', alignItems: 'center', justifyContent: 'center' },
  actionCopy: { alignItems: 'center' },
  actionLabel: { color: home.text, fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center' },
  actionSub: { display: 'none' },
  discover: { minHeight: 100, marginTop: 16, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 15, borderWidth: 1, borderColor: home.line, borderRadius: 13, backgroundColor: home.panel, justifyContent: 'center' },
  discoverCopy: { zIndex: 1, paddingRight: 64 },
  discoverTitle: { color: home.text, fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 0.2 },
  discoverBody: { marginTop: 8, color: '#c4c4c5', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  mapGraphic: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 102, overflow: 'hidden' },
  emptyHero: { minHeight: 308, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,209,46,0.58)', borderRadius: 16, backgroundColor: home.panel },
  emptyContent: { flex: 1, minHeight: 306, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 13 },
  emptyStampRow: { alignSelf: 'flex-start', minHeight: 23, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(255,209,46,0.38)', borderRadius: 4, backgroundColor: 'rgba(5,8,13,0.74)' },
  emptyStamp: { color: '#ffe89a', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  emptyTitle: { color: home.text, fontFamily: 'Inter_700Bold', fontSize: 25, lineHeight: 30, letterSpacing: -0.3 },
  emptyBody: { marginTop: 6, color: '#e1ded6', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  emptyCta: { marginTop: 11 },
  loadingHero: { alignItems: 'center', justifyContent: 'center' },
  errorHero: { justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  card: { backgroundColor: home.panel, borderColor: home.line, gap: 12 },
  cardTitle: { color: home.text, fontFamily: 'Inter_700Bold', fontSize: 17 },
  body: { color: home.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  warsSection: { marginTop: 24, gap: 9 },
  listCard: { paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: home.line, backgroundColor: home.panel },
  badge: { color: home.muted, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
});
