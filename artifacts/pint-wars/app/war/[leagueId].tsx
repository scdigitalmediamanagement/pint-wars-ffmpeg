import React, { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, ErrorText, Screen, Title, uiStyles } from '@/components/AppUi';
import { getLeagueDashboard, logPint } from '@/src/lib/league-service';
import { getCurrentLocation } from '@/src/lib/location-service';
import { findNearbyPubs, type Coordinates, type NearbyPub } from '@/src/lib/pub-service';
import { diagnosticAttemptId, diagnosticStringFingerprint } from '@/src/lib/diagnostic-hash';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

function leagueDurationDays(startsAt: string, endsAt: string) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return Math.max(1, Math.ceil((end - start) / 86400000));
}

function dayNumber(startsAt: string, endsAt: string, status: string) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const durationDays = leagueDurationDays(startsAt, endsAt);
  if (status === 'completed') return durationDays;
  const now = Date.now();
  return Math.max(1, Math.min(durationDays, Math.floor((Math.min(now, end) - start) / 86400000) + 1));
}

function endTimeLabel(endsAt: string) {
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return null;
  return `Ends ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${end.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

type PendingPint = {
  attemptId: string;
  photoUri: string;
  mimeType: string | null;
  latitude: number | null;
  longitude: number | null;
  location: Coordinates;
};

type JustLoggedPub = {
  pub: NearbyPub;
  pintLogId: string;
};

export default function LeagueDashboardScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const queryClient = useQueryClient();
  const [cameraError, setCameraError] = useState('');
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [logError, setLogError] = useState('');
  const [isPreparingPint, setIsPreparingPint] = useState(false);
  const [pubPickerVisible, setPubPickerVisible] = useState(false);
  const [isSearchingPubs, setIsSearchingPubs] = useState(false);
  const [nearbyPubs, setNearbyPubs] = useState<NearbyPub[]>([]);
  const [selectedPub, setSelectedPub] = useState<NearbyPub | null>(null);
  const [nearbyPubMessage, setNearbyPubMessage] = useState('');
  const [pendingPint, setPendingPint] = useState<PendingPint | null>(null);
  const [justLoggedPub, setJustLoggedPub] = useState<JustLoggedPub | null>(null);
  const query = useQuery({
    queryKey: ['league-dashboard', leagueId],
    queryFn: () => getLeagueDashboard(leagueId as string),
    enabled: Boolean(leagueId),
    refetchInterval: 60_000,
  });
  const logMutation = useMutation({
    mutationFn: (input: {
      attemptId: string;
      photoUri: string;
      mimeType: string | null;
      latitude: number | null;
      longitude: number | null;
      pub: NearbyPub | null;
    }) => {
      if (!user || !leagueId) throw new Error('You must be signed in to log a pint.');
      return logPint({
        leagueId,
        userId: user.id,
        ...input,
      });
    },
    onSuccess: (result, variables) => {
      setIsPreparingPint(false);
      void queryClient.invalidateQueries({ queryKey: ['league-dashboard', leagueId] });
      void queryClient.invalidateQueries({ queryKey: ['pub-passport'] });
      if (variables.pub && user) {
        void queryClient.invalidateQueries({
          queryKey: ['pub-reviews', 'eligibility', user.id, variables.pub.provider, variables.pub.placeId],
        });
      }
      setLogError('');

      if (variables.pub) {
          setJustLoggedPub({
            pub: variables.pub,
            pintLogId: result.pintLogId,
          });
      }
    },
    onError: (error) => {
      setIsPreparingPint(false);
      setLogError(error instanceof Error ? error.message : 'The pint could not be logged. Try again.');
    },
  });

  function continueWithPintLog(
    pint: Omit<PendingPint, 'location'>,
    pub: NearbyPub | null,
  ) {
    setPubPickerVisible(false);
    setPendingPint(null);
    setSelectedPub(null);
    setIsPreparingPint(true);
    logMutation.mutate({ ...pint, pub });
  }

  function continueWithoutPub() {
    if (!pendingPint) return;
    const { location: _location, ...pint } = pendingPint;
    continueWithPintLog(pint, null);
  }

  function confirmSelectedPub() {
    if (!pendingPint || !selectedPub) return;
    const { location: _location, ...pint } = pendingPint;
    continueWithPintLog(pint, selectedPub);
  }

  async function getOptionalLocation(): Promise<Coordinates | null> {
    const result = await getCurrentLocation();
    return result.status === 'success' ? result.coordinates : null;
  }

  async function takePintPhoto() {
    setIsPreparingPint(true);
    setCameraError('');
    setCameraBlocked(false);
    setLogError('');

    let permission: ImagePicker.PermissionResponse;
    try {
      permission = await ImagePicker.requestCameraPermissionsAsync();
    } catch {
      setIsPreparingPint(false);
      setCameraError('The camera could not be opened. Please try again.');
      return;
    }
    if (!permission.granted) {
      setCameraBlocked(!permission.canAskAgain);
      setCameraError(
        permission.canAskAgain
          ? 'Camera access is required to photograph your fresh pint. Tap “Try camera again” to retry.'
          : 'Camera access is turned off. Enable it in your device settings, then try again.',
      );
      setIsPreparingPint(false);
      return;
    }

    let photo: ImagePicker.ImagePickerResult;
    try {
      photo = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
      });
    } catch {
      setIsPreparingPint(false);
      setCameraError('The camera could not take a photo. Please try again.');
      return;
    }
    if (photo.canceled || !photo.assets[0]) {
      setIsPreparingPint(false);
      return;
    }

    const capturedPhoto = {
      attemptId: diagnosticAttemptId(),
      photoUri: photo.assets[0].uri,
      mimeType: photo.assets[0].mimeType ?? null,
    };
    console.info('[pint-proof-diagnostic] camera-capture', {
      attemptId: capturedPhoto.attemptId,
      localUriFingerprint: diagnosticStringFingerprint(capturedPhoto.photoUri),
    });

    let location: Coordinates | null = null;
    try {
      location = await getOptionalLocation();
    } catch {
      location = null;
    }

    if (!location) {
      setIsPreparingPint(false);
      continueWithPintLog({
        ...capturedPhoto,
        latitude: null,
        longitude: null,
      }, null);
      return;
    }

    const nextPendingPint = {
      ...capturedPhoto,
      latitude: location.latitude,
      longitude: location.longitude,
      location,
    };
    setPendingPint(nextPendingPint);
    setNearbyPubs([]);
    setSelectedPub(null);
    setNearbyPubMessage('');
    setPubPickerVisible(true);
    setIsSearchingPubs(true);

    try {
      const search = await findNearbyPubs(location);
      setNearbyPubs(search.pubs);
      if (!search.providerConfigured) {
        setNearbyPubMessage('Nearby pub search will appear here when a places provider is connected.');
      } else if (!search.pubs.length) {
        setNearbyPubMessage('No nearby pubs were found. You can continue without selecting one.');
      }
    } catch {
      setNearbyPubMessage('Nearby pubs could not be loaded. You can continue without selecting one.');
    } finally {
      setIsSearchingPubs(false);
      setIsPreparingPint(false);
    }
  }

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
  const durationDays = leagueDurationDays(league.starts_at, league.ends_at);
  const leagueEndLabel = endTimeLabel(league.ends_at);
  const sortedMembers = [...members].sort((a, b) => b.points - a.points || a.joined_at.localeCompare(b.joined_at));
  const totalPoints = members.reduce((total, member) => total + member.points, 0);
  const highestPoints = sortedMembers[0]?.points ?? 0;
  const winners = sortedMembers.filter((member) => member.points === highestPoints);

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 28, gap: 18 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={[styles.kicker, { color: colors.accent }]}>{league.status === 'active' ? `DAY ${day} / ${durationDays}` : 'WAR OVER'}</Text>
          {league.status === 'active' && leagueEndLabel ? (
            <Text style={[styles.endTime, { color: colors.mutedForeground }]}>{leagueEndLabel}</Text>
          ) : null}
          <Title>{league.name}</Title>
        </View>
        <Card style={styles.summary}>
          <View style={uiStyles.row}>
            <View>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{members.length}</Text>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>PLAYERS</Text>
            </View>
            <View>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{totalPoints}</Text>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>TOTAL POINTS</Text>
            </View>
            <View>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{league.capacity}</Text>
              <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>MAX PLAYERS</Text>
            </View>
          </View>
        </Card>
        {league.status === 'completed' ? (
          <Card style={styles.resultCard}>
            <Text style={[styles.selectedLabel, { color: colors.accent }]}>
              {winners.length === 1 ? 'WINNER' : 'TIED WINNERS'}
            </Text>
            <Text style={[styles.resultNames, { color: colors.foreground }]}>
              {winners.map((winner) => winner.display_name).join(' · ')}
            </Text>
            <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
              Final score: {highestPoints} {highestPoints === 1 ? 'point' : 'points'}
            </Text>
          </Card>
        ) : null}
        <View style={{ gap: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Leaderboard</Text>
          <Card style={{ paddingVertical: 8 }}>
            {sortedMembers.map((member, index) => {
              const isCurrentUser = member.user_id === user?.id;
              const isWinner = league.status === 'completed' && member.points === highestPoints;
              return (
                <View key={member.id} style={[styles.playerRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rank, { color: colors.accent }]}>{index + 1}</Text>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.playerName, { color: colors.foreground }]}>{member.display_name}{isCurrentUser ? '  (you)' : ''}</Text>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 12 }}>{member.role === 'host' ? 'Host' : 'Player'}</Text>
                  </View>
                  {isWinner ? (
                    <Text style={[styles.winnerLabel, { color: colors.accent }]}>
                      {winners.length === 1 ? 'WINNER' : 'TIED'}
                    </Text>
                  ) : null}
                  <Text style={[styles.pints, { color: colors.foreground }]}>{member.points} pts</Text>
                </View>
              );
            })}
          </Card>
        </View>
        {league.status === 'active' ? (
          <>
            <Button
              label={cameraError ? 'Try camera again' : 'Log Pint'}
              loading={isPreparingPint || logMutation.isPending}
              onPress={() => void takePintPhoto()}
            />
            {cameraError ? <ErrorText>{cameraError}</ErrorText> : null}
            {cameraBlocked && Platform.OS !== 'web' ? (
              <Button
                label="Open device settings"
                variant="quiet"
                onPress={() => {
                  void Linking.openSettings().catch(() => {
                    setCameraError('Open your device settings and allow camera access for Pint Wars.');
                  });
                }}
              />
            ) : null}
            {logError ? <ErrorText>{logError}</ErrorText> : null}
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
              Take a fresh photo with your pint. Verified visits update your score, including eligible first-pub bonuses.
            </Text>
          </>
        ) : (
          <Button label="Start Another Pint War" onPress={() => router.push('/war/create')} />
        )}
        {members.some((member) => member.user_id === user?.id && member.role === 'host') ? (
          <Pressable onPress={() => router.push({ pathname: '/war/invite', params: { leagueId: league.id } })}>
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>Manage invites</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={!!justLoggedPub} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.modalBackdrop}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground, opacity: 0.45 }]} />
          <View style={[styles.pubSheet, { backgroundColor: colors.background, alignItems: 'center', paddingVertical: 40 }]}>
            <Title>Pint Logged!</Title>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', textAlign: 'center', marginBottom: 24, fontSize: 16, lineHeight: 24 }}>
               Your score has been updated for visiting {justLoggedPub?.pub.name}.
            </Text>
            <View style={{ width: '100%', gap: 12 }}>
              <Button label="Review this pub" onPress={() => {
                  const loggedPub = justLoggedPub;
                 setJustLoggedPub(null);
                  router.push({
                    pathname: '/pub/[placeId]',
                    params: {
                      placeId: loggedPub!.pub.placeId,
                      provider: loggedPub!.pub.provider,
                      name: loggedPub!.pub.name,
                      address: loggedPub!.pub.address,
                      pintLogId: loggedPub!.pintLogId,
                    },
                  });
              }} />
              <Button label="Done" variant="quiet" onPress={() => setJustLoggedPub(null)} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pubPickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={continueWithoutPub}
      >
        <View style={styles.modalBackdrop}>
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground, opacity: 0.45 }]}
          />
          <View style={[styles.pubSheet, { backgroundColor: colors.background }]}>
            <View style={styles.pubSheetHeader}>
              <Text style={[styles.pubSheetTitle, { color: colors.foreground }]}>Choose the pub</Text>
              <Text style={[styles.pubSheetSubtitle, { color: colors.mutedForeground }]}>
                Select a nearby pub, then confirm it before your pint is logged.
              </Text>
            </View>

            {isSearchingPubs ? (
              <View style={styles.pubLoading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
                  Finding nearby pubs…
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.pubList}
                contentContainerStyle={styles.pubListContent}
                showsVerticalScrollIndicator={false}
              >
                {nearbyPubs.map((pub) => {
                  const isSelected =
                    selectedPub?.provider === pub.provider &&
                    selectedPub.placeId === pub.placeId;
                  return (
                    <Pressable
                      key={`${pub.provider}:${pub.placeId}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setSelectedPub(pub)}
                      style={[
                        styles.pubRow,
                        {
                          borderColor: isSelected ? colors.accent : colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.pubName, { color: colors.foreground }]}>{pub.name}</Text>
                        <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                          {pub.address || 'Address unavailable'}
                        </Text>
                      </View>
                      <Text style={[styles.pubDistance, { color: colors.accent }]}>
                        {pub.distanceMeters < 1000
                          ? `${Math.round(pub.distanceMeters)} m`
                          : `${(pub.distanceMeters / 1000).toFixed(1)} km`}
                      </Text>
                    </Pressable>
                  );
                })}

                {nearbyPubMessage ? (
                  <Card>
                    <Text style={[styles.pubEmptyText, { color: colors.mutedForeground }]}>
                      {nearbyPubMessage}
                    </Text>
                  </Card>
                ) : null}

                {selectedPub ? (
                  <Card style={styles.selectedPubCard}>
                    <Text style={[styles.selectedLabel, { color: colors.accent }]}>SELECTED PUB</Text>
                    <Text style={[styles.pubName, { color: colors.foreground }]}>{selectedPub.name}</Text>
                    <Text style={[styles.pubAddress, { color: colors.mutedForeground }]}>
                      {selectedPub.address}
                    </Text>
                  </Card>
                ) : null}
              </ScrollView>
            )}

            <View style={styles.pubActions}>
              {selectedPub ? (
                <Button
                  label={`Confirm ${selectedPub.name}`}
                  onPress={confirmSelectedPub}
                />
              ) : null}
              <Button
                label="Continue without a pub"
                variant={selectedPub ? 'quiet' : 'secondary'}
                disabled={isSearchingPubs}
                onPress={continueWithoutPub}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 3 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.5 },
  endTime: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  summary: { gap: 12 },
  resultCard: { gap: 7 },
  resultNames: { fontFamily: 'Inter_700Bold', fontSize: 22, lineHeight: 28 },
  resultText: { fontFamily: 'Inter_400Regular', lineHeight: 21 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  metricLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 21 },
  playerRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rank: { width: 25, fontFamily: 'Inter_700Bold', fontSize: 18, textAlign: 'center' },
  playerName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  pints: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  winnerLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  pubSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 18,
  },
  pubSheetHeader: { gap: 7 },
  pubSheetTitle: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  pubSheetSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  pubLoading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 12 },
  pubList: { flexGrow: 0 },
  pubListContent: { gap: 10 },
  pubRow: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pubName: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  pubAddress: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 18 },
  pubDistance: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  pubEmptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  selectedPubCard: { gap: 5 },
  selectedLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  pubActions: { gap: 10 },
});