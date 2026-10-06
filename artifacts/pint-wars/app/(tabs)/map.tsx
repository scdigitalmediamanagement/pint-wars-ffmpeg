import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/AppUi';
import { NearbyAction as Button, NearbyDiscovery, NearbyPubCard, pubRating, type NearbyFilter } from '@/components/NearbyPubsPresentation';
import { createNearbyStyles, mapColors } from '@/components/NearbyPubStyles';
import { useAuth } from '@/src/providers/AuthProvider';
import { getMyPubPassport } from '@/src/lib/league-service';
import { getPubReviewSummary } from '@/src/lib/review-service';
import { reviewKeys } from '@/hooks/usePubReviews';
import { getCurrentLocation, type CurrentLocationResult } from '@/src/lib/location-service';
import { findNearbyPubs, type Coordinates, type NearbyPub } from '@/src/lib/pub-service';

type LocationState =
  | { status: 'loading' }
  | CurrentLocationResult;

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function nearbyPubsErrorMessage(error: unknown) {
  const status = getErrorStatus(error);
  if (status === 429) {
    return 'Nearby pub search is temporarily rate-limited. Try again in a moment.';
  }
  if (status === 503) {
    return 'Nearby pub search is not configured right now.';
  }
  return 'Nearby pubs could not be loaded. Try again.';
}

function openPubDetail(pub: NearbyPub) {
  router.push({
    pathname: '/pub/[placeId]',
    params: {
      placeId: pub.placeId,
      provider: pub.provider,
      name: pub.name,
      address: pub.address,
    },
  });
}

function LocationStateCard({
  state,
  onRetry,
}: {
  state: LocationState;
  onRetry: () => void;
}) {
  const colors = mapColors;

  if (state.status === 'loading') {
    return (
      <Card style={styles.stateCard}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.stateTitle, { color: colors.foreground }]}>Getting your location</Text>
        <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
          We use your current location to find nearby pubs.
        </Text>
      </Card>
    );
  }

  if (state.status === 'permission-denied') {
    return (
      <Card style={styles.stateCard}>
        <Text style={[styles.stateTitle, { color: colors.foreground }]}>Location access is off</Text>
        <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
          Allow location access to discover pubs near you. Location is optional and is only used for nearby discovery.
        </Text>
        {state.canAskAgain ? (
          <Button label="Try location again" onPress={onRetry} />
        ) : (
          <>
            <Button
              label="Open device settings"
              onPress={() => {
                if (Platform.OS !== 'web') void Linking.openSettings();
              }}
              disabled={Platform.OS === 'web'}
            />
            <Text style={[styles.stateHint, { color: colors.mutedForeground }]}>
              Turn on location access in your device settings, then return here and refresh.
            </Text>
          </>
        )}
      </Card>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <Card style={styles.stateCard}>
        <Text style={[styles.stateTitle, { color: colors.foreground }]}>Location unavailable</Text>
        <Text style={[styles.stateText, { color: colors.mutedForeground }]}>{state.message}</Text>
        <Button label="Try again" onPress={onRetry} />
      </Card>
    );
  }

  return null;
}

export default function MapScreen() {
  const colors = mapColors;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    NearbyDM: require('@/assets/fonts/wars/DMSans_500Medium.ttf'),
    NearbyBold: require('@/assets/fonts/wars/DMSans_700Bold.ttf'),
    NearbySpace: require('@/assets/fonts/wars/SpaceGrotesk_600SemiBold.ttf'),
  });
  const s = useMemo(() => createNearbyStyles(fontsLoaded), [fontsLoaded]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NearbyFilter>('Nearby');
  const [recenterKey, setRecenterKey] = useState(0);
  const [locationState, setLocationState] = useState<LocationState>({ status: 'loading' });

  const loadLocation = useCallback(async () => {
    setLocationState({ status: 'loading' });
    setLocationState(await getCurrentLocation());
  }, []);

  useEffect(() => {
    void loadLocation();
  }, [loadLocation]);

  const coordinates: Coordinates | null =
    locationState.status === 'success' ? locationState.coordinates : null;

  const nearbyPubsQuery = useQuery({
    queryKey: ['nearby-pubs', coordinates?.latitude, coordinates?.longitude],
    queryFn: () => {
      if (!coordinates) throw new Error('Location is not available.');
      return findNearbyPubs(coordinates);
    },
    enabled: Boolean(coordinates),
    retry: false,
  });

  const refresh = () => {
    if (user) void passportQuery.refetch();
    ratings.forEach((rating) => { void rating.refetch(); });
    if (coordinates) {
      void nearbyPubsQuery.refetch();
      return;
    }
    void loadLocation();
  };

  const pubs = nearbyPubsQuery.data?.pubs ?? [];
  const passportQuery = useQuery({
    queryKey: ['pub-passport', user?.id],
    queryFn: getMyPubPassport,
    enabled: Boolean(user),
  });
  const ratings = useQueries({
    queries: pubs.map((pub) => ({
      queryKey: reviewKeys.summary(user?.id ?? '', pub.provider, pub.placeId),
      queryFn: () => getPubReviewSummary(pub.provider, pub.placeId),
      enabled: Boolean(user),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const visited = new Set((passportQuery.data ?? []).filter((entry) => entry.pub_provider && entry.pub_place_id)
    .map((entry) => `${entry.pub_provider}:${entry.pub_place_id}`));
  const details = new Map(pubs.map((pub, index) => [`${pub.provider}:${pub.placeId}`, ratings[index]]));
  const shown = pubs.filter((pub) => {
    const matches = `${pub.name} ${pub.address}`.toLowerCase().includes(search.trim().toLowerCase());
    return matches && (filter !== 'Not Visited' || (passportQuery.data !== undefined && !visited.has(`${pub.provider}:${pub.placeId}`)));
  }).sort((a, b) => {
    if (filter === 'Top Rated') {
      const aRating = pubRating(details.get(`${a.provider}:${a.placeId}`)?.data) ?? -1;
      const bRating = pubRating(details.get(`${b.provider}:${b.placeId}`)?.data) ?? -1;
      if (aRating !== bRating) return bRating - aRating;
    }
    return a.distanceMeters - b.distanceMeters;
  });

  return (
    <View style={[s.screen, { paddingTop: Math.max(Platform.OS === 'web' ? 27 : 0, insets.top) }]} testID="nearby-pubs-screen">
      <Stack.Screen options={{ title: 'Map', headerShown: false }} />
      <NearbyDiscovery
        s={s} coordinates={coordinates} pubs={shown} count={nearbyPubsQuery.data ? shown.length : null}
        query={search} onQuery={setSearch} filter={filter} onFilter={setFilter}
        canFilterVisited={passportQuery.data !== undefined} onOpen={openPubDetail}
        onRefresh={refresh} onLocation={() => { setRecenterKey((key) => key + 1); void loadLocation(); }}
        busy={locationState.status === 'loading' || nearbyPubsQuery.isFetching}
        recenterKey={recenterKey} bottomInset={Math.max(Platform.OS === 'web' ? 84 : 58, insets.bottom + 50)}
      >
        {locationState.status !== 'success' ? (
          <LocationStateCard state={locationState} onRetry={() => void loadLocation()} />
        ) : (
          <>
            {nearbyPubsQuery.isLoading ? (
              <View style={styles.inlineState}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                  Loading nearby pubs…
                </Text>
              </View>
            ) : null}

            {nearbyPubsQuery.isError ? (
              <Card style={styles.stateCard}>
                <Text style={styles.stateText}>{nearbyPubsErrorMessage(nearbyPubsQuery.error)}</Text>
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                  Google Places may be temporarily unavailable. You can try the search again.
                </Text>
              </Card>
            ) : null}

            {nearbyPubsQuery.data && !nearbyPubsQuery.data.providerConfigured ? (
              <Card style={styles.stateCard}>
                <Text style={[styles.stateTitle, { color: colors.foreground }]}>Pub discovery unavailable</Text>
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                  The nearby pub provider is not configured right now.
                </Text>
              </Card>
            ) : null}

            {!nearbyPubsQuery.isLoading && !nearbyPubsQuery.isError && nearbyPubsQuery.data?.providerConfigured && !pubs.length ? (
              <Card style={styles.stateCard}>
                <Text style={[styles.stateTitle, { color: colors.foreground }]}>No pubs found nearby</Text>
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
                  Try refreshing or moving closer to the area you want to explore.
                </Text>
              </Card>
            ) : null}

            {passportQuery.isError ? <Card style={styles.stateCard}><Text style={styles.stateText}>Visited status could not be refreshed. Retry before relying on Not Visited.</Text><Button label="Retry visited status" onPress={() => void passportQuery.refetch()} /></Card> : null}
            {filter === 'Top Rated' && ratings.some((rating) => rating.isLoading) ? <Text style={styles.stateText}>Loading community ratings…</Text> : null}
            {ratings.some((rating) => rating.isError) ? <Text style={styles.stateHint}>Some community ratings are unavailable. Refresh to retry.</Text> : null}
            {pubs.length > 0 && shown.length === 0 ? <Card style={styles.stateCard}><Text style={styles.stateTitle}>No matching pubs</Text><Text style={styles.stateText}>Try another search or choose Nearby.</Text></Card> : null}
            {shown.map((pub) => {
              const key = `${pub.provider}:${pub.placeId}`;
              const rating = details.get(key);
              return <NearbyPubCard key={key} pub={pub} s={s} summary={rating?.data}
                visited={visited.has(key)} ratingLoading={Boolean(rating?.isLoading)}
                ratingFailed={Boolean(rating?.isError) || !user}
                onOpen={() => openPubDetail(pub)} />;
            })}
          </>
        )}
      </NearbyDiscovery>
    </View>
  );
}

const styles = createNearbyStyles(false);