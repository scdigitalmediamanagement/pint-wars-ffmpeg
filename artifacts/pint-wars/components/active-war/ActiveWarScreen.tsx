import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarActivityFeed } from '@/src/components/WarActivityFeed';
import { CURRENT_LEAGUE_SCORING, type LeagueDashboard, type LeagueMembership } from '@/src/types/league';
import { initials, ordinal } from '@/components/wars/presentation';
import { activeWarColors as c, createActiveWarStyles } from './styles';

type Standing = { member: LeagueMembership; rank: number; isTied: boolean };
type Props = {
  dashboard: LeagueDashboard;
  userId?: string;
  rankedMembers: Standing[];
  currentStanding?: Standing;
  hasScores: boolean;
  day: number;
  durationDays: number;
  remainingLabel: string;
  endLabel: string | null;
  retired: boolean;
  preparing: boolean;
  error?: string;
  refreshError: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLogPint: () => void;
  onInvite?: () => void;
  onRetire?: () => void;
  onEnd?: () => void;
  retiring: boolean;
  ending: boolean;
};
const navigation = [
  { label: 'Home', icon: 'home', route: '/' },
  { label: 'Wars', icon: 'flag', route: '/wars' },
  { label: 'Map', icon: 'map', route: '/map' },
  { label: 'Passport', icon: 'book-open', route: '/passport' },
  { label: 'Profile', icon: 'user', route: '/profile' },
] as const;

export function ActiveWarScreen(props: Props) {
  const { dashboard: { league, members }, userId } = props;
  const [section, setSection] = useState<'leaderboard' | 'activity' | 'details'>('leaderboard');
  const insets = useSafeAreaInsets();
  const [loaded] = useFonts({
    WarsDM_500: require('@/assets/fonts/wars/DMSans_500Medium.ttf'),
    WarsDM_700: require('@/assets/fonts/wars/DMSans_700Bold.ttf'),
    WarsSpace_600: require('@/assets/fonts/wars/SpaceGrotesk_600SemiBold.ttf'),
  });
  const s = useMemo(() => createActiveWarStyles(loaded), [loaded]);
  const position = props.hasScores && props.currentStanding
    ? `${props.currentStanding.isTied ? 'TIED ' : ''}${ordinal(props.currentStanding.rank).toUpperCase()}` : '—';

  function logAction() {
    if (props.retired) return (
      <View style={s.panel}><Text style={s.detailTitle}>Retired from this Pint War</Text>
        <Text style={s.body}>Your existing points remain visible, but you cannot log more pints or earn more points in this league.</Text></View>
    );
    return (
      <>
        <Pressable testID="log-a-pint" accessibilityRole="button" accessibilityLabel="Log a Pint with a fresh proof photo"
          accessibilityState={{ disabled: props.preparing }} disabled={props.preparing} onPress={props.onLogPint}
          style={({ pressed }) => [s.log, { opacity: props.preparing ? 0.6 : pressed ? 0.8 : 1 }]}>
          <LinearGradient colors={['#ffe067', c.gold, '#f4c02c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <View style={s.logIcon}><Ionicons name="beer-outline" size={19} color={c.actionInk} /></View>
          <View style={s.logCopy}><Text style={s.logTitle}>LOG A PINT</Text><Text style={s.logHint}>A fresh photo is required · Pub optional</Text></View>
          {props.preparing ? <ActivityIndicator color={c.actionInk} /> : <Feather name="arrow-right" size={19} color={c.actionInk} />}
        </Pressable>
        {props.error ? <Text accessibilityRole="alert" style={s.body}>{props.error}</Text> : null}
      </>
    );
  }

  return (
    <>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: Platform.OS === 'web' ? 31 : insets.top + 4, paddingBottom: 110 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} tintColor={c.gold} colors={[c.gold]} />}>
        {Platform.OS === 'web' ? <View style={s.status} pointerEvents="none"><Text style={s.statusText}>9:41</Text>
          <View style={s.icons}><Feather name="bar-chart" size={13} color={c.paper} /><Feather name="wifi" size={13} color={c.paper} /><Feather name="battery" size={16} color={c.paper} /></View></View> : null}
        <View style={s.header}>
          <View style={s.brand} accessible accessibilityLabel="Pint Wars">
            <Image source={require('@/assets/images/wars/pw-wars-crest.png')} style={s.crest} resizeMode="contain" accessible={false} />
            <Image source={require('@/assets/images/wars/pw-wars-wordmark.png')} style={s.wordmark} resizeMode="contain" accessible={false} />
          </View>
          {props.onInvite ? <Pressable accessibilityRole="button" testID="active-war-invite" onPress={props.onInvite} style={s.invite}>
            <Feather name="users" size={14} color={c.gold} /><Text style={s.inviteText}>Invite</Text></Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/wars')} style={s.back} testID="active-war-back">
          <Feather name="arrow-left" size={15} color={c.secondary} /><Text style={s.backText}>ALL PINT WARS</Text>
        </Pressable>
        <View style={s.hero} testID="active-war-hero">
          {/* Approved decorative pub photograph, not a claim about this league's location. */}
          <Image source={require('@/assets/images/wars/pw-wars-devon-active.jpg')} style={s.photo} resizeMode="cover" accessible={false} />
          <LinearGradient colors={[c.shade, 'rgba(5,8,13,0.2)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(5,8,13,0.24)', 'rgba(5,8,13,0.95)']} style={StyleSheet.absoluteFill} />
          <View style={s.heroTop}><View style={s.liveBadge}><View style={s.dot} /><Text style={s.smallGold}>LIVE PINT WAR</Text></View>
            <View style={s.countdown}><Feather name="clock" size={11} color={c.wash} /><Text style={s.countdownText}>{props.remainingLabel.toUpperCase()}</Text></View>
          </View>
          <Text style={s.heroTitle}>{league.name}</Text>
          <View style={s.meta}><Text style={s.metaText}>DAY {props.day} OF {props.durationDays}</Text><View style={s.dot} />
            <View style={s.icons}><Feather name="users" size={11} color={c.paper} /><Text style={s.metaText}>{members.length} {members.length === 1 ? 'PLAYER' : 'PLAYERS'}</Text></View>
            <View style={s.place}><Ionicons name="trophy-outline" size={11} color={c.wash} /><Text style={s.placeText}>YOU’RE {position}</Text></View>
          </View>
        </View>
        {props.refreshError ? <View style={s.panel}><Text style={s.body}>Could not refresh this war. Showing the last loaded standings.</Text>
          <Pressable onPress={props.onRefresh} accessibilityRole="button"><Text style={s.link}>Try again</Text></Pressable></View> : null}
        <View style={s.tabs} accessibilityRole="tablist">
          {(['leaderboard', 'activity', 'details'] as const).map((tab) => (
            <Pressable key={tab} testID={`active-war-tab-${tab}`} accessibilityRole="tab" accessibilityState={{ selected: section === tab }}
              onPress={() => setSection(tab)} style={[s.tab, section === tab && s.selectedTab]}>
              <Text style={[s.tabText, section === tab && s.selectedText]}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
            </Pressable>
          ))}
        </View>
        {section === 'leaderboard' ? <>
          <View style={s.sectionHeading}><View><Text style={s.eyebrow}>THE RACE SO FAR</Text><Text style={s.heading}>Leaderboard</Text></View>
            <View style={s.icons}><View style={s.dot} /><Text style={s.smallGold}>LIVE</Text></View></View>
          <View style={s.board} testID="active-war-leaderboard">
            <View style={s.boardHead}><Text style={[s.column, s.rankColumn]}>POS</Text><Text style={[s.column, s.playerColumn]}>PLAYER</Text><Text style={s.column}>POINTS</Text></View>
            {!props.rankedMembers.length ? <View style={s.panel}><Text style={s.body}>No players to show yet</Text></View> : null}
            {props.rankedMembers.map(({ member, rank, isTied }, index) => {
              const me = member.user_id === userId;
              return <View key={member.id} testID={`active-war-player-${member.id}`} accessible
                accessibilityLabel={`${member.display_name}${me ? ', you' : ''}, ${props.hasScores ? `${isTied ? 'tied ' : ''}${ordinal(rank)}` : 'no position yet'}, ${member.points} points, ${member.status}`}
                style={[s.row, me && s.yourRow]}>
                {me ? <View style={s.yourMarker} /> : null}
                <Text style={[s.rank, me && s.yourRank]}>{props.hasScores ? String(rank).padStart(2, '0') : '—'}</Text>
                <View style={[s.avatar, { backgroundColor: c.avatar[index % c.avatar.length] }, me && s.yourAvatar]}>
                  <Text style={[s.avatarText, me && s.yourAvatarText]}>{initials(member.display_name)}</Text></View>
                <View style={s.playerCopy}><View style={{ flexShrink: 1 }}><Text numberOfLines={1} style={s.name}>{member.display_name}</Text>
                  {member.status === 'retired' ? <Text style={s.role}>Retired</Text> : null}</View>
                  {me ? <View style={s.tag}><Text style={s.tagText}>YOU</Text></View> : null}
                  {props.hasScores && isTied ? <Text style={s.role}>TIED</Text> : null}
                </View>
                <Text style={s.score}>{member.points}<Text style={s.units}> {member.points === 1 ? 'pt' : 'pts'}</Text></Text>
              </View>;
            })}
          </View>
          {!props.hasScores ? <Text style={[s.body, { marginTop: 8 }]}>No points on the board yet. Positions appear when points are earned.</Text> : null}
          {logAction()}
          {userId ? <WarActivityFeed leagueId={league.id} currentUserId={userId} presentation="recent" fontsLoaded={loaded} onViewAll={() => setSection('activity')} /> : null}
        </> : section === 'activity' ? <>
          {userId ? <WarActivityFeed leagueId={league.id} currentUserId={userId} presentation="full" fontsLoaded={loaded} /> : null}
          {logAction()}
        </> : <>
          <View style={s.sectionHeading}><View><Text style={s.eyebrow}>{league.name.toUpperCase()}</Text><Text style={s.heading}>War details</Text></View><Text style={s.smallGold}>IN PROGRESS</Text></View>
          <View style={s.panel}>
            <View style={s.detailRow}><Feather name="clock" size={16} color={c.gold} /><View style={s.detailCopy}><Text style={s.detailTitle}>Day {props.day} of {props.durationDays}</Text><Text style={s.body}>{props.remainingLabel}</Text><Text style={s.body}>{props.endLabel ?? 'End date unavailable'}</Text></View></View>
            <View style={s.detailRow}><Feather name="users" size={16} color={c.gold} /><View style={s.detailCopy}><Text style={s.detailTitle}>{members.length} of {league.capacity} players</Text><Text style={s.body}>Host: {members.find(member => member.role === 'host')?.display_name ?? 'Unavailable'}</Text></View></View>
            <Text style={s.detailTitle}>How points work</Text>
            <Text style={s.body}>Pint: +{CURRENT_LEAGUE_SCORING.pointsPerValidPint} point{'\n'}Qualifying pub review: +{CURRENT_LEAGUE_SCORING.reviewBonusPoints} bonus</Text>
            <Text style={s.body}>A review bonus is earned once per player per pub. Editing a review adds no points; older score events keep their original values.</Text>
            <Text style={s.body}>A fresh proof photo is required. Location and pub selection are optional.</Text>
          </View>
          <View style={s.panel}>
            <Text style={s.detailTitle}>Your crew</Text>
            {members.map(member => <View key={member.id} style={s.detailRow}><Text style={[s.body, { flex: 1 }]}>{member.display_name}</Text><Text style={s.role}>{member.role === 'host' ? 'Host' : member.status === 'retired' ? 'Retired' : 'Player'}</Text></View>)}
            {props.onInvite ? <Pressable style={s.management} onPress={props.onInvite} accessibilityRole="button"><Feather name="users" size={16} color={c.gold} /><Text style={s.link}>Manage invites</Text></Pressable> : null}
            {props.onRetire ? <Pressable testID="active-war-retire" style={s.management} disabled={props.retiring} onPress={props.onRetire} accessibilityRole="button"><Text style={s.link}>{props.retiring ? 'Retiring…' : 'Retire from this Pint War'}</Text></Pressable> : null}
            {props.onEnd ? <Pressable testID="active-war-end" style={s.management} disabled={props.ending} onPress={props.onEnd} accessibilityRole="button"><Text style={s.link}>{props.ending ? 'Ending…' : 'End Pint War Early'}</Text></Pressable> : null}
          </View>
          {props.retired ? logAction() : null}
        </>}
      </ScrollView>
      <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 24 : 12) }]}>
        {navigation.map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label}
          accessibilityState={{ selected: item.label === 'Wars' }} onPress={() => router.replace(item.route)} style={s.navItem}>
          <Feather name={item.icon} size={22} color={item.label === 'Wars' ? c.gold : c.secondary} /><Text style={[s.navText, item.label === 'Wars' && s.selectedNavText]}>{item.label}</Text>
        </Pressable>)}
      </View>
    </>
  );
}
