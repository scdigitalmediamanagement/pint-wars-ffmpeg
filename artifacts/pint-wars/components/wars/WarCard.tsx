import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { League, LeagueDashboard, LeagueMembership, MyLeague } from '@/src/types/league';
import home from '@/constants/homeColors';
import { dayLabel, initials, leagueStanding, ordinal } from './presentation';
import type { WarsStyles } from './styles';

const activePhotos = [
  require('@/assets/images/wars/pw-wars-devon-active.jpg'),
  require('@/assets/images/wars/pw-wars-hamburg-trip.jpg'),
];
const completedPhoto = require('@/assets/images/wars/pw-wars-summer-complete.jpg');

function PlayerAvatar({ member, index, avatarUrl, styles }: {
  member: LeagueMembership; index: number; avatarUrl?: string | null; styles: WarsStyles;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <View accessible accessibilityLabel={member.display_name}
      style={[styles.avatar, index === 0 && styles.firstAvatar, index === 2 && styles.thirdAvatar]}>
      {avatarUrl && avatarUrl !== failedUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover"
          onError={() => setFailedUrl(avatarUrl)} accessible={false} />
      ) : (
        <Text style={[styles.avatarText, index === 0 && styles.firstAvatarText]}>{initials(member.display_name)}</Text>
      )}
    </View>
  );
}

export function WarCard({ item, dashboard, league, index, now, failed, styles, userId, avatarUrl }: {
  item: MyLeague; dashboard?: LeagueDashboard; league: League; index: number; now: number;
  failed: boolean; styles: WarsStyles; userId?: string; avatarUrl?: string | null;
}) {
  const completed = league.status === 'completed';
  const compact = !completed && index > 0;
  const removed = item.membershipStatus === 'removed';
  const { members, me, rank } = leagueStanding(item, dashboard);
  const count = members?.length;
  const shownMembers = members?.slice(0, 3) ?? [];
  const extra = count == null ? 0 : Math.max(0, count - shownMembers.length);
  const unavailable = failed || removed || Boolean(dashboard && !me);
  const rankCopy = removed ? 'Removed from this war'
    : rank != null ? `${completed ? 'You finished' : item.membershipStatus === 'retired' ? 'Retired · position' : 'Your position'} ${ordinal(rank)}`
    : unavailable ? 'Standing unavailable' : 'Loading standings…';

  return (
    <Pressable testID={`war-card-${league.id}`} accessibilityRole="button"
      accessibilityLabel={`${league.name}, ${completed ? 'completed' : 'active'}, ${dayLabel(league, now)}${count != null ? `, ${count} players` : ''}, ${rankCopy}${me ? `, ${me.points} points` : ''}`}
      disabled={removed} accessibilityState={{ disabled: removed }}
      onPress={() => router.push(`/war/${league.id}`)}
      style={({ pressed }) => [styles.card, compact && styles.compactCard, completed && styles.completedCard, { opacity: removed ? 0.6 : pressed ? 0.8 : 1 }]}
    >
      {/* Approved decorative imagery; not a claim about a league's location or photos. */}
      <Image source={completed ? completedPhoto : activePhotos[index % activePhotos.length]}
        style={styles.photo} resizeMode="cover" accessible={false} />
      <LinearGradient pointerEvents="none" style={StyleSheet.absoluteFill}
        colors={['#0e131a', '#0e131a', 'rgba(14,19,26,0.93)', 'rgba(14,19,26,0.37)', 'rgba(10,14,18,0.14)']}
        locations={[0, 0.35, 0.47, 0.7, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <LinearGradient pointerEvents="none" style={StyleSheet.absoluteFill}
        colors={['transparent', 'rgba(4,7,11,0.42)']} locations={[0.56, 1]} />
      <View style={styles.cardContent}>
        <View style={styles.badge}>
          {completed ? <Feather name="check" size={10} color="#f3dc89" /> : <View style={styles.liveDot} />}
          <Text style={styles.badgeText}>{removed ? 'REMOVED' : completed ? 'COMPLETED' : item.membershipStatus === 'retired' ? 'LIVE · RETIRED' : 'LIVE PINT WAR'}</Text>
        </View>
        <Text numberOfLines={2} style={[styles.cardTitle, compact && styles.compactTitle, completed && styles.completedTitle]}>{league.name}</Text>
        <Text style={[styles.metadata, (compact || completed) && styles.compactMetadata]}>
          {dayLabel(league, now)}<Text style={styles.separator}>  ·  </Text>
          {count == null ? removed || failed ? 'Players unavailable' : 'Loading players…' : `${count} ${count === 1 ? 'player' : 'players'}`}
        </Text>
        {!completed ? (
          <View style={[styles.roster, compact && styles.compactRoster]}>
            {shownMembers.map((member, avatarIndex) => (
              <PlayerAvatar key={member.id} member={member} index={avatarIndex} styles={styles}
                avatarUrl={member.user_id === userId ? avatarUrl : undefined} />
            ))}
            {extra > 0 ? <View style={[styles.avatar, styles.moreAvatar]}><Text style={styles.avatarText}>+{extra}</Text></View> : null}
            <Text numberOfLines={1} style={styles.rosterText}>
              {count == null ? removed || failed ? 'Player details unavailable' : 'Loading your crew…'
                : me ? count === 1 ? 'Just you so far' : `You & ${count - 1} others` : `${count} players`}
            </Text>
          </View>
        ) : null}
        <View style={[styles.footer, completed && styles.completedFooter]}>
          <Text style={styles.rank}>
            {rank != null ? <>{completed ? 'You finished ' : item.membershipStatus === 'retired' ? 'Retired · position ' : 'Your position '}<Text style={styles.rankValue}>{ordinal(rank)}</Text></> : rankCopy}
          </Text>
          {me ? <Text style={styles.score}>{me.points} {me.points === 1 ? 'pt' : 'pts'}</Text> : null}
        </View>
      </View>
      {!removed ? <View style={styles.chevron}><Feather name="chevron-right" size={15} color="#fff7dc" /></View> : null}
    </Pressable>
  );
}
