import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyPubPassport, type PubPassportEntry } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
import { PassportHeader, PassportIntro, PassportStats, PassportDiscovery, PassportPubCard } from '@/components/PubPassportPresentation';
import { passportStyles as s } from '@/components/PubPassportStyles';
import home from '@/constants/homeColors';

export default function PassportScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<'Visited' | 'Reviews'>('Visited');
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({
    queryKey: ['pub-passport', user?.id],
    queryFn: getMyPubPassport,
    enabled: Boolean(user),
  });

  useFocusEffect(useCallback(() => {
    if (user) void query.refetch();
  }, [user?.id, query.refetch]));

  const entries = query.data ?? [];
  // Each pub supports at most one current review per player. Community review
  // counts belong on the pub cards, not in the player's personal review total.
  const reviewed = entries.filter((entry) => Boolean(entry.current_user_review_id));
  const shown = filter === 'Reviews' ? reviewed : entries;
  const hasData = query.data !== undefined;
  const openMap = () => router.push('/(tabs)/map');
  const openPub = (entry: PubPassportEntry) => {
    if (!entry.pub_provider || !entry.pub_place_id) return;
    router.push({
      pathname: '/pub/[placeId]',
      params: {
        placeId: entry.pub_place_id,
        provider: entry.pub_provider,
        name: entry.pub_name || '',
        address: entry.address || '',
      },
    });
  };

  async function refresh() {
    if (!user) return;
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={s.screen} testID="pub-passport-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Math.max(Platform.OS === 'web' ? 67 : 0, insets.top + 8),
          paddingBottom: Math.max(118, insets.bottom + 100),
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={home.gold} colors={[home.gold]} />}
      >
        <View style={s.container}>
          <PassportHeader onMap={openMap} />
          <View style={s.content}>
            <PassportIntro />
            <PassportStats
              pubs={hasData ? entries.length : null}
              pints={hasData ? entries.reduce((sum, entry) => sum + entry.pint_count, 0) : null}
              reviews={hasData ? reviewed.length : null}
            />
            <PassportDiscovery onMap={openMap} />
            <View style={s.sectionHeading}>
              <View style={s.sectionCopy}>
                <Text style={s.eyebrow}>YOUR LITTLE BLACK BOOK</Text>
                <Text style={s.sectionTitle}>Good places, remembered.</Text>
              </View>
              <View style={s.sectionCount}>
                <Text style={s.count}>{hasData ? (filter === 'Reviews' ? reviewed.length : entries.length) : '—'}</Text>
                <Text style={s.countLabel}>{filter === 'Reviews' ? 'REVIEWS' : 'PLACES'}</Text>
              </View>
            </View>
            <View style={s.filters} accessibilityRole="tablist">
              {(['Visited', 'Reviews'] as const).map((item) => (
                <Pressable key={item} testID={`passport-filter-${item.toLowerCase()}`}
                  accessibilityRole="tab" accessibilityState={{ selected: filter === item }}
                  onPress={() => setFilter(item)} style={[s.filter, filter === item && s.filterSelected]}>
                  <Text style={[s.filterLabel, filter === item && s.filterLabelSelected]}>{item}</Text>
                  {item === 'Reviews' && hasData ? <Text style={[s.filterCount, filter === item && s.filterLabelSelected]}>{reviewed.length}</Text> : null}
                </Pressable>
              ))}
            </View>

            {query.isLoading ? <View style={s.state} accessibilityLabel="Loading your pub passport"><ActivityIndicator color={home.gold} /><Text style={s.stateText}>Loading your places…</Text></View> : null}
            {query.isError ? (
              <View style={s.state} testID="passport-error">
                <Text style={s.stateTitle}>Could not load your Passport.</Text>
                <Text style={s.stateText}>{query.error instanceof Error ? query.error.message : 'Please try again.'}</Text>
                <Pressable accessibilityRole="button" onPress={() => void query.refetch()} testID="passport-retry" style={s.retry}>
                  <Text style={s.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}
            {!user ? <View style={s.state}><Text style={s.stateText}>Sign in to see your pub passport.</Text></View> : null}
            {hasData && !entries.length ? (
              <View style={s.state} testID="passport-empty">
                <Text style={s.stateTitle}>No location-tagged visits yet</Text>
                <Text style={s.stateText}>Log a pint with location enabled during a Pint War and your recorded visit will appear here. You can still log pints without sharing your location.</Text>
              </View>
            ) : hasData && !shown.length ? (
              <View style={s.state} testID="passport-reviews-empty">
                <Text style={s.stateTitle}>Your reviews start here.</Text>
                <Text style={s.stateText}>Open a visited pub to view its reviews and your existing review options.</Text>
              </View>
            ) : (
              <View style={s.list}>
                {shown.map((entry) => <PassportPubCard key={entry.location_key} entry={entry} onOpen={() => openPub(entry)} />)}
              </View>
            )}
            {shown.length ? <>
              <Text style={s.photoNote}>Card imagery is illustrative, not a photo of each pub.</Text>
              <Text style={s.endNote}>End of the good ones—for now</Text>
            </> : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
