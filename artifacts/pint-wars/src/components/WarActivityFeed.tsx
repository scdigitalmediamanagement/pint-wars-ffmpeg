import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import {
  getGetPintWarActivityQueryKey,
  useGetPintWarActivity,
  type PintWarActivityEvent,
} from '@workspace/api-client-react';
import { Card } from '@/components/AppUi';
import { useColors } from '@/hooks/useColors';

type WarActivityFeedProps = {
  leagueId: string;
  currentUserId: string;
  accessToken: string | null;
};

function activityAction(event: PintWarActivityEvent) {
  switch (event.type) {
    case 'pint_logged':
      return 'logged a pint';
    case 'pub_review':
      return 'submitted a qualifying pub review';
    case 'legacy_pub_bonus':
      return 'recorded a historical pub bonus';
  }
}

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function activityPhotoUrl(leagueId: string, pintLogId: string) {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return null;
  return `https://${domain}/api/pint-proofs/leagues/${encodeURIComponent(leagueId)}/photos/${encodeURIComponent(pintLogId)}`;
}

function PrivateActivityPhoto({
  leagueId,
  event,
  accessToken,
}: {
  leagueId: string;
  event: PintWarActivityEvent;
  accessToken: string | null;
}) {
  const colors = useColors();
  const [webImageUri, setWebImageUri] = useState<string | null>(null);
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [viewerVisible, setViewerVisible] = useState(false);
  const remoteUrl = event.photoPintLogId
    ? activityPhotoUrl(leagueId, event.photoPintLogId)
    : null;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setWebImageUri(null);
    setImageState('loading');

    if (!remoteUrl || !accessToken) {
      setImageState('error');
      return () => {
        cancelled = true;
      };
    }

    if (Platform.OS !== 'web') {
      return () => {
        cancelled = true;
      };
    }

    fetch(remoteUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error('The proof photo is unavailable.');
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setWebImageUri(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setImageState('error');
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, remoteUrl]);

  if (!remoteUrl || !accessToken || imageState === 'error') {
    return (
      <View style={[styles.photoUnavailable, { backgroundColor: colors.muted }]}>
        <Ionicons name="image-outline" size={21} color={colors.mutedForeground} />
        <Text style={[styles.photoUnavailableText, { color: colors.mutedForeground }]}>
          Photo unavailable
        </Text>
      </View>
    );
  }

  const imageSource =
    Platform.OS === 'web'
      ? webImageUri
        ? { uri: webImageUri }
        : null
      : {
          uri: remoteUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${event.playerName}'s proof photo`}
        disabled={imageState !== 'loaded' || !imageSource}
        onPress={() => setViewerVisible(true)}
        style={styles.photoPressable}
      >
        {imageSource ? (
          <ExpoImage
            source={imageSource}
            contentFit="cover"
            cachePolicy="memory"
            accessibilityLabel={`Pint proof photo from ${event.playerName}`}
            onLoad={() => setImageState('loaded')}
            onError={() => setImageState('error')}
            style={[styles.photo, { backgroundColor: colors.muted }]}
          />
        ) : (
          <View style={[styles.photo, { backgroundColor: colors.muted }]} />
        )}
        {imageState === 'loading' ? (
          <View style={[styles.photoLoading, { backgroundColor: colors.muted }]}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.photoViewer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={() => setViewerVisible(false)}
            style={styles.closeViewerButton}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {imageSource ? (
            <ExpoImage
              source={imageSource}
              contentFit="contain"
              cachePolicy="memory"
              style={styles.fullPhoto}
            />
          ) : null}
        </View>
      </Modal>
    </>
  );
}

export function WarActivityFeed({
  leagueId,
  currentUserId,
  accessToken,
}: WarActivityFeedProps) {
  const colors = useColors();
  const query = useGetPintWarActivity(leagueId, {
    query: {
      queryKey: getGetPintWarActivityQueryKey(leagueId),
      refetchInterval: 30_000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
  });

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={[styles.kicker, { color: colors.accent }]}>LIVE WAR</Text>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Activity
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh war activity"
          accessibilityState={{ disabled: query.isFetching }}
          disabled={query.isFetching}
          onPress={() => void query.refetch()}
          style={styles.refreshButton}
        >
          {query.isFetching ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="refresh-outline" size={20} color={colors.accent} />
          )}
        </Pressable>
      </View>

      <Card style={styles.feedCard}>
        {query.isLoading ? (
          <View style={styles.stateRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              Loading recent activity…
            </Text>
          </View>
        ) : query.isError && !query.data ? (
          <View style={styles.errorState}>
            <Text style={[styles.stateText, { color: colors.foreground }]}>
              Activity could not be loaded. Check your connection and try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void query.refetch()}
              style={styles.retryButton}
            >
              <Ionicons name="refresh-outline" size={17} color={colors.accent} />
              <Text style={[styles.retryText, { color: colors.accent }]}>Try again</Text>
            </Pressable>
          </View>
        ) : !query.data?.events.length ? (
          <View style={styles.emptyState}>
            <Ionicons name="beer-outline" size={24} color={colors.accent} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No activity yet
            </Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              Start the Pint War by logging your first pint.
            </Text>
          </View>
        ) : (
          query.data.events.map((event, index) => (
            <View
              key={event.id}
              style={[
                styles.event,
                index < query.data.events.length - 1
                  ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                  : null,
              ]}
            >
              <View style={styles.eventHeader}>
                <View style={styles.eventCopy}>
                  <Text style={[styles.eventTitle, { color: colors.foreground }]}>
                    <Text style={[styles.playerName, { color: colors.foreground }]}>
                      {event.playerName}
                      {event.userId === currentUserId ? ' (you)' : ''}
                    </Text>
                    {' '}{activityAction(event)}
                  </Text>
                  {event.pubName ? (
                    <View style={styles.pubLabel}>
                      <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
                      <Text
                        numberOfLines={1}
                        style={[styles.pubName, { color: colors.mutedForeground }]}
                      >
                        {event.pubName}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[styles.eventDate, { color: colors.mutedForeground }]}>
                    {formatActivityDate(event.occurredAt)}
                  </Text>
                </View>
                {event.scoreImpact !== null ? (
                  <View style={[styles.scorePill, { backgroundColor: colors.muted }]}>
                    <Text style={[styles.scoreText, { color: colors.accent }]}>
                      {event.scoreImpact > 0 ? '+' : ''}
                      {event.scoreImpact} {Math.abs(event.scoreImpact) === 1 ? 'pt' : 'pts'}
                    </Text>
                  </View>
                ) : null}
              </View>
              {event.historicalScore ? (
                <Text style={[styles.historicalNote, { color: colors.mutedForeground }]}>
                  Recorded under an earlier scoring rule
                </Text>
              ) : null}
              {event.photoPintLogId ? (
                <PrivateActivityPhoto
                  leagueId={leagueId}
                  event={event}
                  accessToken={accessToken}
                />
              ) : null}
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionHeadingCopy: {
    gap: 3,
  },
  kicker: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedCard: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  stateRow: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  errorState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 18,
  },
  emptyState: {
    minHeight: 148,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
  },
  stateText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 6,
  },
  retryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  event: {
    gap: 10,
    paddingVertical: 15,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  eventCopy: {
    flex: 1,
    gap: 5,
  },
  eventTitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  playerName: {
    fontFamily: 'Inter_700Bold',
  },
  pubLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pubName: {
    flexShrink: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  eventDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  scorePill: {
    borderRadius: 18,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scoreText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  historicalNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  photoPressable: {
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 16,
  },
  photo: {
    width: '100%',
    height: 220,
  },
  photoLoading: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoUnavailable: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
  },
  photoUnavailableText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  photoViewer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.96)',
    padding: 18,
  },
  closeViewerButton: {
    position: 'absolute',
    zIndex: 1,
    top: 36,
    right: 18,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullPhoto: {
    width: '100%',
    height: '85%',
  },
});