import React, { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Button, Card, ErrorText, Screen, Title, uiStyles } from '@/components/AppUi';
import { getLeagueDashboard, logPint } from '@/src/lib/league-service';
import { findNearbyPubs, type Coordinates, type NearbyPub } from '@/src/lib/pub-service';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';
import type { LeagueDashboard } from '@/src/types/league';

function dayNumber(startsAt: string, endsAt: string, status: string) {
  if (status === 'completed') return 30;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  return Math.max(1, Math.min(30, Math.floor((Math.min(now, end) - start) / 86400000) + 1));
}

type PendingPint = {
  photoUri: string;
  mimeType: string | null;
  latitude: number | null;
  longitude: number | null;
  location: Coordinates;
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
  const query = useQuery({
    queryKey: ['league-dashboard', leagueId],
    queryFn: () => getLeagueDashboard(leagueId as string),
    enabled: Boolean(leagueId),
  });
  const logMutation = useMutation({
    mutationFn: (input: {
      photoUri: string;
      mimeType: string | null;
      latitude: number | null;
      longitude: number | null;
    }) => {
      if (!user || !leagueId) throw new Error('You must be signed in to log a pint.');
      return logPint({
        leagueId,
        userId: user.id,
        ...input,
      });
    },
    onSuccess: () => {
      setIsPreparingPint(false);
      queryClient.setQueryData<LeagueDashboard>(['league-dashboard', leagueId], (current) => {
        if (!current || !user) return current;
        return {
          ...current,
          members: current.members.map((member) =>
            member.user_id === user.id
              ? { ...member, pint_total: member.pint_total + 1 }
              : member,
          ),
        };
      });
      void queryClient.invalidateQueries({ queryKey: ['league-dashboard', leagueId] });
      setLogError('');
    },
    onError: (error) => {
      setIsPreparingPint(false);
      setLogError(error instanceof Error ? error.message : 'The pint could not be logged. Try again.');
    },
  });

  function continueWithPintLog(pint: Omit<PendingPint, 'location'>) {
    setPubPickerVisible(false);
    setPendingPint(null);
    setSelectedPub(null);
    setIsPreparingPint(true);
    logMutation.mutate(pint);
  }

  async function getOptionalLocation(): Promise<Coordinates | null> {
    const existingPermission = await Location.getForegroundPermissionsAsync();
    const permission = existingPermission.granted
      ? existingPermission
      : await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
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
      photoUri: photo.assets[0].uri,
      mimeType: photo.assets[0].mimeType ?? null,
    };

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
      });
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
  const sortedMembers = [...members].sort((a, b) => b.pint_total - a.pint_total || a.joined_at.localeCompare(b.joined_at));
  const totalPints = members.reduce((total, member) => total + member.pint_total, 0);

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
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{totalPints}</Text>
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
        <Button
          label={cameraError ? 'Try camera again' : 'Log Pint'}
          disabled={league.status !== 'active'}
          loading={logMutation.isPending}
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
          Take a fresh photo with your pint. Each logged pint adds exactly one point.
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