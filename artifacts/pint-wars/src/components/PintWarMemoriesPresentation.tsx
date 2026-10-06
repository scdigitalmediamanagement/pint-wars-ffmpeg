import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { PintWarActivityEvent } from '@workspace/api-client-react';
import colors from '@/constants/memoriesColors';
import type { LeagueSummary } from '@/src/types/league';
import { memoriesPhotoTargetCount, orderMemoriesPhotos } from '@/src/lib/memories-selection';
import { memoriesDependencies, nativeMemories } from '@/src/lib/memories-native';
import { runMemoriesAction } from '@/src/lib/memories-actions';
import { prepareMemoriesFilm, type MemoriesFilm, type MemoriesProgress } from '@/src/lib/memories-video-pipeline';
import { MemoriesVideoPlayer } from './MemoriesVideoPlayer';

type Props = {
  userId: string;
  league: { id: string; name: string; completed_at: string | null };
  summary: LeagueSummary;
  events: PintWarActivityEvent[];
};
type Phase = 'idle' | 'generating' | 'ready' | 'failed';

function dateLabel(value: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? `Completed ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Pint War complete';
}
function timeLabel(seconds: number) {
  const time = Math.max(0, Math.floor(seconds));
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function PintWarMemoriesPresentation({ userId, league, summary, events }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [film, setFilm] = useState<MemoriesFilm | null>(null);
  const [progress, setProgress] = useState<MemoriesProgress>({ progress: 0, label: 'Selecting moments from the whole war…' });
  const [generationError, setGenerationError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [actionError, setActionError] = useState(false);
  const [photosDenied, setPhotosDenied] = useState(false);
  const [action, setAction] = useState<'save' | 'share' | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [seek, setSeek] = useState({ time: 0, id: 0 });
  const [timelineWidth, setTimelineWidth] = useState(1);
  const [playbackError, setPlaybackError] = useState('');
  const request = useRef<AbortController | null>(null);
  const retainedFilm = useRef<MemoriesFilm | null>(null);
  const alive = useRef(false);
  const actionPending = useRef(false);
  const standings = useMemo(() => [...summary.leaderboard].sort(
    (a, b) => b.points - a.points || a.joined_at.localeCompare(b.joined_at),
  ), [summary.leaderboard]);
  const highScore = standings[0]?.points ?? 0;
  const winners = highScore > 0 ? standings.filter((player) => player.points === highScore) : [];
  const winnerNames = winners.map((player) => player.display_name).join(' · ');
  const duration = film?.duration ?? 30;
  const activeMoment = film?.moments.findLastIndex((moment) => moment.startTime <= currentTime) ?? -1;
  const winnerPhoto = film?.moments.find((moment) => winners.some((winner) => winner.user_id === moment.userId))
    ?? film?.moments.at(-1);

  async function createFilm() {
    if (!nativeMemories || actionPending.current || (request.current && !request.current.signal.aborted)) return;
    const controller = new AbortController();
    request.current = controller;
    const previous = retainedFilm.current;
    retainedFilm.current = null;
    setFilm(null);
    setPlaying(false);
    setCurrentTime(0);
    setSeek((value) => ({ time: 0, id: value.id + 1 }));
    setPlaybackError('');
    setGenerationError('');
    setActionNotice('');
    setPhotosDenied(false);
    setPhase('generating');
    setProgress({ progress: 0, label: 'Selecting moments from the whole war…' });
    if (previous) nativeMemories.releaseJob(previous.jobId);
    try {
      // Keep the locked weighting, temporal coverage, diversity and fallback order.
      const order = orderMemoriesPhotos(events);
      const result = await prepareMemoriesFilm(order, memoriesPhotoTargetCount(order.length), {
        leagueName: league.name,
        completedLabel: dateLabel(league.completed_at),
        winnerNames,
        winnerPoints: highScore,
        winnerCount: winners.length,
        totalPints: summary.stats.total_pints,
        playerCount: summary.stats.player_count,
        pubsVisited: summary.stats.pubs_visited,
      }, memoriesDependencies(league.id), controller.signal, (value) => {
        if (alive.current && request.current === controller) setProgress(value);
      });
      if (!alive.current || controller.signal.aborted) {
        nativeMemories.releaseJob(result.jobId);
        return;
      }
      retainedFilm.current = result;
      setFilm(result);
      setPhase('ready');
    } catch (error) {
      if (!alive.current || request.current !== controller) return;
      setPhase(controller.signal.aborted ? 'idle' : 'failed');
      setGenerationError(controller.signal.aborted
        ? 'Generation cancelled. Your war and photos are unchanged.'
        : errorMessage(error, 'We couldn’t finish the film. Your war is safe; try again.'));
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  useEffect(() => {
    alive.current = true;
    // Delay the initial start so React's development effect replay cannot launch
    // a duplicate export. Entering from Create Memories starts the real job.
    const timer = setTimeout(() => { void createFilm(); }, 0);
    return () => {
      alive.current = false;
      clearTimeout(timer);
      request.current?.abort();
      request.current = null;
      const current = retainedFilm.current;
      retainedFilm.current = null;
      if (current) nativeMemories?.releaseJob(current.jobId);
    };
  }, [league.id, userId]);

  function jumpTo(time: number) {
    if (!film || playbackError) return;
    const bounded = Math.max(0, Math.min(time, duration));
    setCurrentTime(bounded);
    setSeek((value) => ({ time: bounded, id: value.id + 1 }));
  }

  async function performAction(kind: 'save' | 'share') {
    if (!film || !nativeMemories || actionPending.current) return;
    actionPending.current = true;
    setAction(kind);
    setPlaying(false);
    setActionNotice('');
    setActionError(false);
    setPhotosDenied(false);
    try {
      const result = await runMemoriesAction(kind, film.jobId, nativeMemories);
      if (alive.current) {
        setActionNotice(result.notice);
        setActionError(result.failed);
        setPhotosDenied(result.photosDenied);
      }
    } finally {
      actionPending.current = false;
      if (alive.current) setAction(null);
    }
  }

  const unavailableMessage = Platform.OS === 'ios'
    ? 'This iPhone build does not include the Memories exporter. Install a native build containing the local module.'
    : 'Create, save and share this film in the Pint Wars iPhone build. Video export is not available in the web preview or on Android.';
  const progressPercent = `${Math.round(progress.progress * 100)}%` as const;
  const playbackPercent = `${Math.min(100, Math.max(0, currentTime / duration * 100))}%` as const;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
      <View style={styles.warHeading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>A WAR TO REMEMBER</Text>
          <Text style={styles.warName}>{league.name}</Text>
        </View>
        <View style={styles.completed}><Ionicons name="checkmark" size={12} color={colors.gold} /><Text style={styles.completedText}>COMPLETED</Text></View>
      </View>
      <Text style={styles.warMeta}>
        {summary.stats.player_count} PLAYERS · {summary.stats.pubs_visited} PUBS · FINAL WHISTLE
      </Text>

      <View style={styles.hero} testID="memories-film-hero">
        {film ? (
          <MemoriesVideoPlayer
            style={StyleSheet.absoluteFill}
            uri={film.uri}
            playing={playing}
            seek={seek}
            onStatus={({ nativeEvent }) => {
              if (nativeEvent.error) {
                setPlaybackError(nativeEvent.error);
                setPlaying(false);
              }
              if (nativeEvent.time !== undefined) setCurrentTime(nativeEvent.time);
              if (nativeEvent.playing !== undefined) setPlaying(nativeEvent.playing);
            }}
            accessibilityLabel={`${league.name} generated Memories MP4`}
            testID="memories-native-video"
          />
        ) : null}
        <LinearGradient colors={[colors.shade, colors.transparent, colors.shade]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.filmMarks} pointerEvents="none">
          <Text style={styles.filmMark}>MEMORY FILM</Text>
          <Text style={styles.qualityMark}>30 SEC · HD</Text>
        </View>
        {phase === 'ready' && !playbackError ? (
          <Pressable testID="play-memories-video" accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause Memories video' : currentTime >= duration - 0.2 ? 'Replay Memories video' : 'Play Memories video'}
            onPress={() => setPlaying((value) => !value)} style={styles.playButton}>
            <Ionicons name={playing ? 'pause' : 'play'} size={23} color={colors.actionInk} />
          </Pressable>
        ) : (
          <View style={styles.heroState} accessibilityLiveRegion="polite">
            {phase === 'generating'
              ? <ActivityIndicator size="large" color={colors.gold} />
              : <Ionicons name={phase === 'failed' || playbackError ? 'alert-circle-outline' : 'film-outline'} size={30} color={colors.gold} />}
            <Text style={styles.heroStateTitle}>
              {phase === 'generating' ? 'Your film is taking shape.' : playbackError ? 'The film couldn’t play.' : phase === 'failed' ? 'We couldn’t finish the film.' : nativeMemories ? 'Keep the whole war.' : 'Make the film on iPhone.'}
            </Text>
            <Text style={styles.heroStateCopy}>
              {phase === 'generating' ? progress.label : playbackError || generationError || (nativeMemories ? 'A 30-second keepsake from your crew’s real moments.' : unavailableMessage)}
            </Text>
            {phase === 'generating' ? (
              <>
                <View style={styles.generationTrack}><View style={[styles.progressFill, { width: progressPercent }]} /></View>
                <Text style={styles.generationPercent}>{progressPercent}</Text>
                <Pressable testID="cancel-memories-generation" accessibilityRole="button" onPress={() => request.current?.abort()}>
                  <Text style={styles.linkText}>Cancel generation</Text>
                </Pressable>
              </>
            ) : nativeMemories ? (
              <Pressable testID="retry-memories-generation" accessibilityRole="button" onPress={() => { void createFilm(); }} style={styles.retryButton}>
                <Ionicons name="refresh" size={14} color={colors.actionInk} />
                <Text style={styles.retryText}>{phase === 'idle' ? 'Create film' : 'Try again'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.filmDetails}>
        <View>
          <Text style={styles.filmTitle}>30 second highlight video</Text>
          <Text style={styles.filmMeta}>{film ? 'MP4 READY TO PLAY · 720P' : 'PORTRAIT MP4 · MADE ON YOUR IPHONE'}</Text>
        </View>
        <Text style={styles.fileType}>.MP4</Text>
      </View>

      <View style={styles.timeline}>
        <View style={styles.times}><Text style={styles.time}>{timeLabel(currentTime)}</Text><Text style={styles.time}>{timeLabel(duration)}</Text></View>
        <Pressable testID="seek-memories-video" accessibilityRole="adjustable" accessibilityLabel="Memories video timeline"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(currentTime), text: timeLabel(currentTime) }}
          accessibilityActions={[{ name: 'increment', label: 'Forward five seconds' }, { name: 'decrement', label: 'Back five seconds' }]}
          onAccessibilityAction={({ nativeEvent }) => jumpTo(currentTime + (nativeEvent.actionName === 'increment' ? 5 : -5))}
          disabled={!film || Boolean(playbackError)}
          onLayout={({ nativeEvent }) => setTimelineWidth(Math.max(1, nativeEvent.layout.width))}
          onPress={({ nativeEvent }) => jumpTo(nativeEvent.locationX / timelineWidth * duration)}
          style={[styles.seekTouchArea, !film && styles.disabled]}>
          <View style={styles.timelineTrack}><View style={[styles.progressFill, { width: playbackPercent }]} /></View>
        </Pressable>
        <View style={styles.times}><Text style={styles.timelineLabel}>THE FIRST MOMENT</Text><Text style={styles.timelineLabel}>THE FINAL WHISTLE</Text></View>
      </View>

      <View style={styles.actions}>
        <Pressable testID="save-memories-video" accessibilityRole="button" disabled={!film || action !== null}
          onPress={() => { void performAction('save'); }} style={[styles.saveButton, (!film || action !== null) && styles.disabled]}>
          {action === 'save' ? <ActivityIndicator color={colors.actionInk} /> : <Ionicons name="download-outline" size={18} color={colors.actionInk} />}
          <Text style={styles.saveText}>Save Video</Text>
        </Pressable>
        <Pressable testID="share-memories-video" accessibilityRole="button" disabled={!film || action !== null}
          onPress={() => { void performAction('share'); }} style={[styles.shareButton, (!film || action !== null) && styles.disabled]}>
          {action === 'share' ? <ActivityIndicator color={colors.text} /> : <Ionicons name="share-outline" size={18} color={colors.text} />}
          <Text style={styles.shareText}>Share Video</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </Pressable>
      </View>
      {actionNotice ? <Text testID="memories-action-notice" accessibilityLiveRegion="polite" style={[styles.notice, actionError && styles.error]}>{actionNotice}</Text> : null}
      {photosDenied ? (
        <Pressable testID="memories-photo-settings" accessibilityRole="button" onPress={() => {
          void Linking.openSettings().catch(() => setActionNotice('Open iPhone Settings and allow Pint Wars to add photos and videos.'));
        }}><Text style={styles.linkText}>Open iPhone Settings</Text></Pressable>
      ) : null}

      {film ? (
        <>
          <View style={styles.sectionHeading}>
            <View><Text style={styles.eyebrow}>THE STORY OF THE WAR</Text><Text style={styles.sectionTitle}>Little moments. One film.</Text></View>
            <Text style={styles.cutCount}>{String(film.moments.length).padStart(2, '0')} CUTS</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.momentStrip}>
            {film.moments.map((moment, index) => (
              <Pressable key={moment.pintLogId} testID={`memories-moment-${index}`} accessibilityRole="button"
                accessibilityLabel={`Jump to ${moment.playerName}${moment.pubName ? ` at ${moment.pubName}` : ''}, ${timeLabel(moment.startTime)}`}
                accessibilityState={{ selected: activeMoment === index }} onPress={() => jumpTo(moment.startTime)} style={styles.moment}>
                <View style={[styles.thumbnail, activeMoment === index && styles.selectedThumbnail]}>
                  <Image source={{ uri: moment.uri }} style={styles.image} contentFit="cover" cachePolicy="none" />
                  <Text style={styles.thumbnailTime}>{timeLabel(moment.startTime)}</Text>
                </View>
                <Text style={styles.momentTitle} numberOfLines={1}>{moment.playerName}</Text>
                {moment.pubName ? <Text style={styles.momentMeta} numberOfLines={1}>{moment.pubName}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
          {film.skippedCount > 0 ? <Text style={styles.notice}>{film.skippedCount} unavailable {film.skippedCount === 1 ? 'photo was' : 'photos were'} skipped.</Text> : null}
        </>
      ) : null}

      <View style={styles.winnerCard} testID="memories-final-result">
        {winnerPhoto ? <Image source={{ uri: winnerPhoto.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="none" /> : null}
        <LinearGradient colors={[colors.transparent, colors.background]} style={StyleSheet.absoluteFill} />
        <View style={styles.winnerCopy}>
          <View style={styles.winnerKicker}><Ionicons name="trophy" size={13} color={colors.gold} /><Text style={styles.eyebrow}>THE FINAL WHISTLE</Text></View>
          <Text style={styles.winnerTitle}>{winners.length === 1 ? `${winnerNames} took the win.` : winners.length > 1 ? `${winnerNames} shared the win.` : 'No score winner.'}</Text>
          <Text style={styles.winnerMeta}>{summary.stats.total_pints} pints. {summary.stats.player_count} players. {dateLabel(league.completed_at)}.</Text>
        </View>
        {winners.length ? <View style={styles.winnerScore}><Text style={styles.score}>{highScore}</Text><Text style={styles.scoreLabel}>PTS</Text></View> : null}
      </View>
      <View style={styles.finalStandings}>
        <Text style={styles.eyebrow}>FINAL SCORES</Text>
        {standings.map((member, index) => (
          <View key={member.id} style={styles.standing}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.standingName} numberOfLines={1}>{member.display_name}</Text>
            <Text style={styles.standingPoints}>{member.points} PTS</Text>
          </View>
        ))}
      </View>
      {film ? <Pressable testID="regenerate-memories-video" accessibilityRole="button" disabled={action !== null}
        onPress={() => { void createFilm(); }}><Text style={styles.linkText}>Shuffle and make another film</Text></Pressable> : null}
      <Text style={styles.footer}>Made to be kept.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: Platform.OS === 'web' ? 34 : 30, gap: 16 },
  warHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingCopy: { flex: 1, gap: 5 },
  eyebrow: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.5, color: colors.gold },
  warName: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 29, lineHeight: 35, color: colors.text },
  completed: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.line },
  completedText: { fontFamily: 'DMSans_700Bold', fontSize: 8, color: colors.gold, letterSpacing: 0.5 },
  warMeta: { fontFamily: 'DMSans_500Medium', fontSize: 9, color: colors.muted, letterSpacing: 0.7, marginTop: -8 },
  hero: { height: 260, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  filmMarks: { position: 'absolute', top: 15, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between' },
  filmMark: { fontFamily: 'DMSans_700Bold', fontSize: 9, letterSpacing: 1.2, color: colors.text },
  qualityMark: { fontFamily: 'DMSans_700Bold', fontSize: 8, color: colors.gold, letterSpacing: 1 },
  playButton: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  heroState: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 22, gap: 10, width: '100%' },
  heroStateTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text, textAlign: 'center' },
  heroStateCopy: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center' },
  generationTrack: { width: '85%', height: 4, backgroundColor: colors.line, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 3 },
  generationPercent: { fontFamily: 'DMSans_700Bold', fontSize: 9, color: colors.gold },
  retryButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', gap: 6 },
  retryText: { fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.actionInk },
  filmDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filmTitle: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: colors.text },
  filmMeta: { fontFamily: 'DMSans_500Medium', fontSize: 8, letterSpacing: 0.8, marginTop: 5, color: colors.muted },
  fileType: { fontFamily: 'DMSans_700Bold', fontSize: 9, color: colors.gold, backgroundColor: colors.panelSoft, padding: 8, borderRadius: 6 },
  timeline: { gap: 2 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontFamily: 'DMSans_700Bold', fontSize: 10, color: colors.text },
  seekTouchArea: { height: 30, justifyContent: 'center' },
  timelineTrack: { height: 4, backgroundColor: colors.line, borderRadius: 3, overflow: 'hidden' },
  timelineLabel: { fontFamily: 'DMSans_500Medium', fontSize: 7, letterSpacing: 1, color: colors.muted },
  actions: { flexDirection: 'row', gap: 10 },
  saveButton: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.actionInk },
  shareButton: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: colors.panelSoft, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareText: { fontFamily: 'DMSans_700Bold', fontSize: 13, color: colors.text },
  disabled: { opacity: 0.4 },
  notice: { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18, color: colors.muted },
  error: { color: colors.error },
  linkText: { fontFamily: 'DMSans_700Bold', fontSize: 12, color: colors.gold, textAlign: 'center', paddingVertical: 5 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  sectionTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: colors.text, marginTop: 5 },
  cutCount: { fontFamily: 'DMSans_700Bold', fontSize: 8, letterSpacing: 1, color: colors.muted },
  momentStrip: { gap: 10 },
  moment: { width: 112, gap: 4 },
  thumbnail: { height: 92, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  selectedThumbnail: { borderColor: colors.gold, borderWidth: 2 },
  image: { width: '100%', height: '100%' },
  thumbnailTime: { position: 'absolute', right: 5, bottom: 5, backgroundColor: colors.shade, color: colors.text, fontFamily: 'DMSans_700Bold', fontSize: 9, padding: 3, borderRadius: 3 },
  momentTitle: { fontFamily: 'DMSans_700Bold', fontSize: 11, color: colors.text },
  momentMeta: { fontFamily: 'DMSans_400Regular', fontSize: 9, color: colors.muted },
  winnerCard: { minHeight: 148, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.panelSoft, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'flex-end', padding: 16, gap: 12 },
  winnerCopy: { flex: 1, gap: 6 },
  winnerKicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  winnerTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 21, lineHeight: 27, color: colors.text },
  winnerMeta: { fontFamily: 'DMSans_400Regular', fontSize: 10, lineHeight: 16, color: colors.muted },
  winnerScore: { alignItems: 'center', paddingBottom: 4 },
  score: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 36, color: colors.gold },
  scoreLabel: { fontFamily: 'DMSans_700Bold', fontSize: 9, color: colors.gold },
  finalStandings: { gap: 9, paddingTop: 5 },
  standing: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rank: { width: 15, color: colors.muted, fontFamily: 'DMSans_500Medium', fontSize: 12 },
  standingName: { flex: 1, color: colors.text, fontFamily: 'DMSans_500Medium', fontSize: 12 },
  standingPoints: { color: colors.gold, fontFamily: 'DMSans_700Bold', fontSize: 11 },
  footer: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: colors.muted, textAlign: 'center', paddingTop: 8 },
});
