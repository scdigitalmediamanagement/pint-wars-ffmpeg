import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorText, Screen, Title, uiStyles } from '@/components/AppUi';
import { PubMap } from '@/components/PubMap';
import { useColors } from '@/hooks/useColors';
import { getCurrentLocation, type CurrentLocationResult } from '@/src/lib/location-service';
import { findNearbyPubs, type Coordinates, type NearbyPub } from '@/src/lib/pub-service';

type LocationState =
  | { status: 'loading' }
  | CurrentLocationResult;

function formatDistance(distanceMeters: number) {
  return distanceMeters < 1000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}

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
  const colors = useColors();

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
  const colors = useColors();
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
    if (coordinates) {
      void nearbyPubsQuery.refetch();
      return;
    }
    void loadLocation();
  };

  const pubs = nearbyPubsQuery.data?.pubs ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Map' }} />
      <ScrollView
        contentContainerStyle={[uiStyles.content, styles.content]}
        showsVerticalScrollIndicator={false}
      >
        <Title eyebrow="Find your next stop">Nearby pubs</Title>

        {locationState.status !== 'success' ? (
          <LocationStateCard state={locationState} onRetry={() => void loadLocation()} />
        ) : (
          <>
            <PubMap
              coordinates={locationState.coordinates}
              pubs={pubs}
              onSelect={openPubDetail}
            />

            <Button
              label="Refresh nearby pubs"
              variant="secondary"
              onPress={refresh}
              loading={nearbyPubsQuery.isFetching}
            />

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
                <ErrorText>{nearbyPubsErrorMessage(nearbyPubsQuery.error)}</ErrorText>
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

            {pubs.length ? (
              <View style={styles.list}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Nearby pubs</Text>
                {pubs.map((pub) => (
                  <Pressable
                    key={`${pub.provider}:${pub.placeId}`}
                    accessibilityRole="button"
                    onPress={() => openPubDetail(pub)}
                    style={({ pressed }) => [
                      styles.pubRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        opacity: pressed ? 0.78 : 1,
                      },
                    ]}
                  >
                    <View style={styles.pubCopy}>
                      <Text style={[styles.pubName, { color: colors.foreground }]}>{pub.name}</Text>
                      <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                        {pub.address || 'Address unavailable'}
                      </Text>
                    </View>
                    <Text style={[styles.pubDistance, { color: colors.accent }]}>
                      {formatDistance(pub.distanceMeters)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 22, gap: 16 },
  stateCard: { gap: 10 },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  stateText: { fontFamily: 'Inter_400Regular', lineHeight: 21 },
  stateHint: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  inlineState: { alignItems: 'center', gap: 8, paddingVertical: 14 },
  list: { gap: 12, marginTop: 4 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  pubRow: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pubCopy: { flex: 1, gap: 4 },
  pubName: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  pubAddress: { fontFamily: 'Inter_400Regular', lineHeight: 19 },
  pubDistance: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});