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
  getPintWarActivityPhoto,
  getGetPintWarActivityQueryKey,
  useGetPintWarActivity,
  type PintWarActivityEvent,
} from '@workspace/api-client-react';
import { Card } from '@/components/AppUi';
import { useColors } from '@/hooks/useColors';
import { initials } from '@/components/wars/presentation';
import { activeWarColors, createActiveWarStyles } from '@/components/active-war/styles';

type WarActivityFeedProps = {
  leagueId: string;
  currentUserId: string;
  presentation?: 'recent' | 'full';
  fontsLoaded?: boolean;
  onViewAll?: () => void;
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

function blobAsDataUri(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('The proof photo could not be decoded.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('The proof photo could not be decoded.'));
    reader.readAsDataURL(blob);
  });
}

function PrivateActivityPhoto({
  leagueId,
  event,
}: {
  leagueId: string;
  event: PintWarActivityEvent;
}) {
  const colors = useColors();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [viewerVisible, setViewerVisible] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const pintLogId = event.photoPintLogId;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setImageUri(null);
    setImageState('loading');

    if (!pintLogId) {
      setImageState('error');
      return () => {
        cancelled = true;
      };
    }

    async function loadProtectedPhoto(photoId: string) {
      try {
        const blob = await getPintWarActivityPhoto(leagueId, photoId);
        if (cancelled) return;

        if (Platform.OS === 'web') {
          objectUrl = URL.createObjectURL(blob);
          setImageUri(objectUrl);
          return;
        }

        const dataUri = await blobAsDataUri(blob);
        if (!cancelled) setImageUri(dataUri);
      } catch {
        if (!cancelled) setImageState('error');
      }
    }

    void loadProtectedPhoto(pintLogId);

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [leagueId, pintLogId, retryVersion]);

  if (!pintLogId || imageState === 'error') {
    return (
      <Pressable
        accessibilityRole={pintLogId ? 'button' : undefined}
        accessibilityLabel="Retry loading proof photo"
        disabled={!pintLogId}
        onPress={() => {
          setImageState('loading');
          setRetryVersion((version) => version + 1);
        }}
        style={[styles.photoUnavailable, { backgroundColor: colors.muted }]}
      >
        <Ionicons name="image-outline" size={21} color={colors.mutedForeground} />
        <Text style={[styles.photoUnavailableText, { color: colors.mutedForeground }]}>
          {pintLogId ? 'Photo unavailable · Tap to retry' : 'Photo unavailable'}
        </Text>
      </Pressable>
    );
  }

  const imageSource = imageUri ? { uri: imageUri } : null;

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
            cachePolicy="none"
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
              cachePolicy="none"
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
  presentation,
  fontsLoaded = false,
  onViewAll,
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

  // Opt-in presentation only. The existing API, cache, polling and protected
  // photo loader/viewer remain the same for both recent and full activity.
  if (presentation) {
    const s = createActiveWarStyles(fontsLoaded);
    const c = activeWarColors;
    const events = presentation === 'recent' ? query.data?.events.slice(0, 3) : query.data?.events;
    return (
      <View style={s.activity} testID={`active-war-activity-${presentation}`}>
        <View style={s.activityHeader}>
          <Text style={s.activityTitle}>{presentation === 'recent' ? 'RECENT ACTIVITY' : 'WAR ACTIVITY FEED'}</Text>
          <View style={s.icons}><View style={s.dot} /><Text style={s.smallGold}>LIVE</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh war activity" disabled={query.isFetching}
              onPress={() => void query.refetch()} style={s.refresh}>
              {query.isFetching ? <ActivityIndicator size="small" color={c.gold} /> : <Ionicons name="refresh-outline" size={13} color={c.gold} />}
            </Pressable>
          </View>
        </View>
        {query.isLoading ? <View style={s.panel}><ActivityIndicator color={c.gold} /><Text style={s.body}>Loading recent activity…</Text></View>
          : query.isError && !query.data ? <View style={s.panel}><Text style={s.body}>Activity could not be loaded. Check your connection and try again.</Text>
            <Pressable onPress={() => void query.refetch()} accessibilityRole="button" style={s.viewAll}><Text style={s.link}>Try again</Text></Pressable></View>
          : !events?.length ? <View style={s.panel}><Text style={s.detailTitle}>No activity yet</Text><Text style={s.body}>Start the Pint War by logging your first pint.</Text></View>
          : events.map(event => {
            const time = new Date(event.occurredAt).getTime();
            const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
            const relativeTime = !Number.isFinite(time) ? 'Time unavailable'
              : minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago`
              : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
            return (
              <View key={event.id}>
                <View style={s.activityRow}>
                  <View style={[s.avatar, { backgroundColor: event.type === 'pint_logged' ? c.avatar[0] : c.avatar[1] }]}>
                    <Text style={[s.avatarText, event.type === 'pint_logged' && s.yourAvatarText]}>{initials(event.playerName)}</Text></View>
                  <View style={s.activityCopy}>
                    <Text style={s.activityText}><Text style={s.activityName}>{event.playerName}{event.userId === currentUserId ? ' (you)' : ''}</Text> {activityAction(event)}</Text>
                    {event.pubName ? <View style={s.icons}><Ionicons name="location-outline" size={9} color={c.secondary} /><Text numberOfLines={1} style={[s.activityVenue, { flexShrink: 1 }]}>{event.pubName}</Text></View> : null}
                    {event.historicalScore ? <Text style={s.activityVenue}>Recorded under an earlier scoring rule</Text> : null}
                    {presentation === 'full' && event.scoreImpact !== null ? <Text style={s.activityVenue}>{event.scoreImpact > 0 ? '+' : ''}{event.scoreImpact} {Math.abs(event.scoreImpact) === 1 ? 'pt' : 'pts'}</Text> : null}
                  </View>
                  {event.photoPintLogId && presentation === 'recent' && onViewAll ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`View ${event.playerName}'s proof photo in Activity`}
                      onPress={onViewAll} style={s.refresh}><Ionicons name="camera-outline" size={13} color={c.gold} /></Pressable>
                  ) : null}
                  <Text accessibilityLabel={formatActivityDate(event.occurredAt)} style={s.activityTime}>{relativeTime}</Text>
                </View>
                {presentation === 'full' && event.photoPintLogId ? <PrivateActivityPhoto leagueId={leagueId} event={event} /> : null}
              </View>
            );
          })}
        {query.isError && query.data ? <Text style={s.activityVenue}>Could not refresh activity. Showing previously loaded events.</Text> : null}
        {onViewAll ? <Pressable testID="active-war-view-activity" onPress={onViewAll} style={s.viewAll} accessibilityRole="button"><Text style={s.link}>View all activity →</Text></Pressable> : null}
      </View>
    );
  }

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