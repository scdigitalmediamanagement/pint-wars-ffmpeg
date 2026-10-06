import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Screen } from '@/components/AppUi';
import { getLeagueDashboard, getMyLeagues, getMyProfile } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
import type { LeagueStatus } from '@/src/types/league';
import home from '@/constants/homeColors';
import { WarCard } from '@/components/wars/WarCard';
import { createWarsStyles } from '@/components/wars/styles';
import { currentLeague } from '@/components/wars/presentation';

export default function WarsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<LeagueStatus>('active');
  const [now, setNow] = useState(Date.now);
  const [refreshing, setRefreshing] = useState(false);
  // Screen-scoped fonts: no changes to Home or other screens' typography/loading.
  const [fontsLoaded, fontError] = useFonts({
    WarsDM_500: require('@/assets/fonts/wars/DMSans_500Medium.ttf'),
    WarsDM_700: require('@/assets/fonts/wars/DMSans_700Bold.ttf'),
    WarsSpace_600: require('@/assets/fonts/wars/SpaceGrotesk_600SemiBold.ttf'),
  });
  const styles = useMemo(() => createWarsStyles(fontsLoaded), [fontsLoaded]);
  const query = useQuery({ queryKey: ['my-leagues'], queryFn: getMyLeagues });
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user!.id),
    enabled: Boolean(user?.id),
  });
  const freeTrialAvailable = profileQuery.data?.free_trial_used_at === null;
  const items = query.data ?? [];
  const dashboardQueries = useQueries({
    queries: items.map((item) => ({
      queryKey: ['league-dashboard', item.league.id],
      queryFn: () => getLeagueDashboard(item.league.id),
      staleTime: 30_000,
      enabled: item.membershipStatus !== 'removed',
    })),
  });
  // Prefer dashboard details without allowing an older active cache to hide completion.
  const leagues = items.map((item, index) => ({
    item,
    dashboard: dashboardQueries[index]?.data,
    league: currentLeague(item, dashboardQueries[index]?.data),
    failed: dashboardQueries[index]?.isError ?? false,
  }));
  const activeLeagues = leagues.filter(({ league }) => league.status === 'active');
  const completedLeagues = leagues.filter(({ league }) => league.status === 'completed');
  const visibleLeagues = tab === 'active' ? activeLeagues : completedLeagues;
  const failedDetails = leagues.some(({ failed }) => failed);

  const refetch = useCallback(async () => {
    await Promise.all([
      query.refetch(),
      queryClient.refetchQueries({ queryKey: ['league-dashboard'], type: 'active' }),
      user?.id ? profileQuery.refetch() : Promise.resolve(),
    ]);
  }, [query.refetch, queryClient, profileQuery.refetch, user?.id]);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const refresh = async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    void refetchRef.current();
  }, []));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        void refetchRef.current();
      }
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  function renderCard(entry: (typeof leagues)[number], index: number) {
    return <WarCard key={entry.item.membershipId} {...entry} index={index} now={now}
      styles={styles} userId={user?.id} avatarUrl={profileQuery.data?.avatar_url} />;
  }

  return (
    <Screen style={{ backgroundColor: home.background }}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, {
          paddingTop: Math.max(Platform.OS === 'web' ? 67 : 0, insets.top + 8),
          paddingBottom: Math.max(124, insets.bottom + 100),
        }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={home.gold} colors={[home.gold]} />}
      >
        {Platform.OS === 'web' ? (
          <View pointerEvents="none" style={styles.statusBar}>
            <Text style={styles.statusTime}>9:41</Text>
            <View style={styles.statusIcons}>
              <Feather name="bar-chart" size={13} color={home.text} />
              <Feather name="wifi" size={13} color={home.text} />
              <Feather name="battery" size={16} color={home.text} />
            </View>
          </View>
        ) : null}
        <View style={styles.header}>
          <View style={styles.brand} accessible accessibilityLabel="Pint Wars">
            <Image source={require('@/assets/images/wars/pw-wars-crest.png')} style={styles.crest} resizeMode="contain" accessible={false} />
            <Image source={require('@/assets/images/wars/pw-wars-wordmark.png')} style={styles.wordmark} resizeMode="contain" accessible={false} />
          </View>
          <Pressable testID="wars-create" accessibilityRole="button" accessibilityLabel="Create a Pint War" hitSlop={6}
            onPress={() => router.push('/war/create')}
            style={({ pressed }) => [styles.create, { opacity: pressed ? 0.8 : 1 }]}>
            <Feather name="plus" size={15} color={home.gold} /><Text style={styles.createText}>Create</Text>
          </Pressable>
        </View>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>YOUR LEAGUES</Text>
          <Text style={styles.title}>The rivalry is on.</Text>
        </View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {(['active', 'completed'] as const).map((status) => {
            const selected = status === tab;
            const count = status === 'active' ? activeLeagues.length : completedLeagues.length;
            return (
              <Pressable key={status} testID={`wars-filter-${status}`} accessibilityRole="tab"
                accessibilityLabel={`${status === 'active' ? 'Active' : 'Completed'} Pint Wars`}
                accessibilityState={{ selected }} onPress={() => setTab(status)}
                style={({ pressed }) => [styles.tab, selected && styles.selectedTab, { opacity: pressed ? 0.8 : 1 }]}>
                <Text style={[styles.tabText, selected && styles.selectedTabText]}>{status.toUpperCase()}</Text>
                <View style={[styles.count, selected && styles.selectedCount]}>
                  <Text style={[styles.countText, selected && styles.selectedCountText]}>
                    {query.data == null && (query.isLoading || query.isError) ? '—' : count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {query.isError || failedDetails ? (
          <View style={styles.message} testID="wars-load-error">
            <Text style={styles.body}>{query.isError ? 'Could not refresh your wars. Please try again.' : 'Some player details could not be loaded.'}</Text>
            <Pressable onPress={refresh} style={styles.retry} accessibilityRole="button" testID="wars-retry">
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}
        {query.isLoading || (!fontsLoaded && !fontError) ? (
          <View style={styles.loading} testID="wars-loading"><ActivityIndicator color={home.gold} /></View>
        ) : query.data != null ? (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{tab === 'active' ? 'ACTIVE WARS' : 'THE FINAL WHISTLE'}</Text>
                <Text style={styles.sectionSide}>{visibleLeagues.length} {visibleLeagues.length === 1 ? 'war' : 'wars'}</Text>
              </View>
              {visibleLeagues.length ? visibleLeagues.map(renderCard) : (
                <View style={styles.empty} testID={`wars-empty-${tab}`}>
                  <Feather name={tab === 'active' ? 'flag' : 'check'} size={18} color={home.gold} />
                  <Text style={styles.emptyTitle}>{tab === 'active' ? 'No active Pint Wars' : 'Nothing archived just yet'}</Text>
                  <Text style={[styles.body, styles.centeredBody]}>{tab === 'active' ? 'Get the crew together and make your next visit count.' : 'Once a war wraps up, you’ll find it here.'}</Text>
                  {tab === 'active' ? (
                    <Pressable accessibilityRole="button" onPress={() => router.push('/war/create')} style={styles.primaryButton}>
                      <Feather name="plus" size={15} color={home.actionInk} /><Text style={styles.primaryText}>Create a Pint War</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
            {tab === 'active' && completedLeagues.length ? (
              <View style={[styles.section, { marginTop: 20 }]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>RECENTLY COMPLETED</Text>
                  <Text style={styles.sectionSide}>IN THE ARCHIVE</Text>
                </View>
                {completedLeagues.slice(0, 1).map(renderCard)}
                {completedLeagues.length > 1 ? (
                  <Pressable testID="wars-view-archive" accessibilityRole="button" onPress={() => setTab('completed')} style={styles.archiveLink}>
                    <Text style={styles.retryText}>View all {completedLeagues.length} completed wars</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {/* Preserve the original Join action and entitlement information without
            replacing the approved feed with trial/checkout panels. */}
        <View style={styles.legacyActions}>
          <Pressable testID="wars-join" accessibilityRole="button" onPress={() => router.push('/war/join')}
            style={({ pressed }) => [styles.join, { opacity: pressed ? 0.8 : 1 }]}>
            <Text style={styles.joinText}>Join a Pint War</Text><Feather name="arrow-right" size={16} color={home.gold} />
          </Pressable>
          {profileQuery.isLoading ? <ActivityIndicator color={home.gold} /> : null}
          {profileQuery.isError ? <Text style={styles.body}>Could not check your free-trial entitlement.</Text>
            : freeTrialAvailable ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/war/create')}>
                <Text style={styles.retryText}>Create your free 4-player, 10-day trial</Text>
              </Pressable>
            ) : profileQuery.data ? (
              <Text style={styles.body}>Free trial already used. Each account gets one 4-player, 10-day trial. You can still join paid Pint Wars when they are available.</Text>
            ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
