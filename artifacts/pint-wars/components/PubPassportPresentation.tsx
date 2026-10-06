import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import type { PubPassportEntry } from '@/src/lib/league-service';
import home from '@/constants/homeColors';
import { passportStyles as s } from './PubPassportStyles';

export function PassportHeader({ onMap }: { onMap: () => void }) {
  return (
    <View style={s.header}>
      <View style={s.brand} accessible accessibilityLabel="Pint Wars, your pub passport">
        <Image source={require('@/assets/images/home/pw-reference-crest.png')} style={s.crest} resizeMode="contain" />
        <Image source={require('@/assets/images/home/pw-reference-wordmark.png')} style={s.wordmark} resizeMode="contain" />
        <View style={s.brandDivider} />
        <Text style={s.brandLabel}>YOUR PUB{'\n'}PASSPORT</Text>
      </View>
      <Pressable onPress={onMap} style={s.mapButton} accessibilityRole="button" accessibilityLabel="Open pub map" testID="passport-map">
        <Feather name="map" size={13} color={home.gold} /><Text style={s.mapButtonText}>Map</Text>
      </Pressable>
    </View>
  );
}

export function PassportIntro() {
  return (
    <View style={s.intro}>
      <View style={s.sectionCopy}>
        <Text style={s.eyebrow}>THE PLACES YOU’VE MADE YOURS</Text>
        <Text style={s.title} accessibilityRole="header">Your Pub Passport</Text>
      </View>
      <View style={s.stamp} accessible={false}><Text style={s.stampText}>GOOD{'\n'}TIMES</Text></View>
    </View>
  );
}

export function PassportStats({ pubs, pints, reviews }: { pubs: number | null; pints: number | null; reviews: number | null }) {
  return (
    <View style={s.stats}>
      {[{ label: 'PUBS VISITED', value: pubs }, { label: 'PINTS LOGGED', value: pints }, { label: 'REVIEWS', value: reviews }].map((stat, index) => (
        <View key={stat.label} style={[s.stat, index > 0 && s.statDivider]} accessible accessibilityLabel={`${stat.label}: ${stat.value ?? 'unavailable'}`}>
          <Text style={s.statValue}>{stat.value ?? '—'}</Text><Text style={s.statLabel}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

function DiscoveryMap() {
  return (
    <View style={s.mapArt} accessible={false}>
      <Svg width="100%" height="100%" viewBox="0 0 150 118" fill="none">
        <Path d="M0 0h150v118H0z" fill="#111a1f" />
        <Path d="M-7 82 29 64 49 69 67 48 91 47 110 26 156 23M-4 103 36 85 57 89 84 69 108 75 156 54M16-8 31 20 27 42 49 69 42 97 57 126M77-5 70 22 91 47 84 69 98 99 93 124M137-3 124 18 110 26 119 51 108 75 127 103" stroke="#3f5150" strokeWidth={1.2} />
        <Path d="M-4 31 25 36 47 27 64 38 88 31 107 41 153 37M-9 114 35 100 57 89 84 69 107 41 124 18" stroke="#596461" strokeWidth={2.3} />
        <Path d="M6 7 39 3 57 15 80 11 105 16 137 6M-7 57 23 53 44 58 66 48 91 47 118 51 153 45" stroke="#304b3d" strokeWidth={4} />
        <Circle cx={43} cy={50} r={4} fill="#d4c9a9" opacity={0.7} />
        <Path d="M71 17c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14Z" fill={home.gold} />
        <Circle cx={71} cy={31} r={5} fill="#11171b" />
        <Path d="M119 68c-6 0-10 5-10 10 0 8 10 18 10 18s10-10 10-18c0-5-4-10-10-10Z" fill="#f0eee6" />
        <Circle cx={119} cy={78} r={3.5} fill="#11171b" />
      </Svg>
    </View>
  );
}

export function PassportDiscovery({ onMap }: { onMap: () => void }) {
  return (
    <View style={s.discovery}>
      <View style={s.discoveryCopy}>
        <Text style={[s.eyebrow, s.goldEyebrow]}>EXPLORE A NEW AREA</Text>
        <Text style={s.discoveryTitle}>New here?</Text>
        <Text style={s.discoveryText}>Discover pubs you haven’t visited.</Text>
        <Pressable onPress={onMap} accessibilityRole="button" accessibilityLabel="Explore nearby pubs on the map" testID="passport-explore" style={s.exploreButton}>
          <Text style={s.exploreText}>Explore nearby pubs</Text><Feather name="arrow-right" size={14} color={home.actionInk} />
        </Pressable>
      </View>
      <DiscoveryMap />
    </View>
  );
}

function visitDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PassportPubCard({ entry, onOpen }: { entry: PubPassportEntry; onOpen: () => void }) {
  const identified = Boolean(entry.pub_provider && entry.pub_place_id);
  const reviewed = Boolean(entry.current_user_review_id);
  const ratings = [entry.average_atmosphere, entry.average_pints_drinks, entry.average_staff, entry.average_music];
  const average = entry.review_count > 0 && ratings.every((value) => value !== null && Number.isFinite(value))
    ? ratings.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 4
    : null;
  const location = entry.address || `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`;
  const content = (
    <LinearGradient colors={['#141b21', '#0c1117']} style={s.pubCard}>
      <View style={s.photo}>
        <Image source={require('@/assets/images/home/pw-home-pints.jpg')} style={s.photoImage} resizeMode="cover" accessible={false} />
        <LinearGradient colors={['transparent', 'rgba(3,6,8,0.88)']} style={s.photoShade} />
        <Text style={s.photoCaption}>ILLUSTRATIVE</Text>
      </View>
      <View style={s.pubCopy}>
        <Text style={s.pubName} numberOfLines={2}>{entry.pub_name ?? 'Pub name unavailable'}</Text>
        {!entry.pub_name ? <Text style={s.identification}>Waiting for pub identification</Text> : null}
        <Text style={s.location} numberOfLines={2}>{location}</Text>
        <Text style={s.pints}>{entry.pint_count} {entry.pint_count === 1 ? 'pint' : 'pints'} logged</Text>
        <View style={s.visit}><Feather name="calendar" size={10} color={home.muted} /><Text style={s.visitText}>Last visit · {visitDate(entry.most_recent_visit)}</Text></View>
        {identified ? <Text style={s.reviewCount}>{entry.review_count ? `${entry.review_count} community ${entry.review_count === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}</Text> : null}
      </View>
      {identified ? (
        <View style={[s.reviewBadge, reviewed && s.reviewBadgeGold]}>
          {average !== null ? <><FontAwesome name="star" size={12} color={home.gold} /><Text style={s.rating}>{average.toFixed(1)}</Text></> : <Feather name="message-circle" size={14} color={reviewed ? home.gold : home.muted} />}
          <Text style={[s.reviewStatus, reviewed && s.reviewStatusGold]}>{reviewed ? 'Reviewed' : 'Review'}</Text>
        </View>
      ) : null}
    </LinearGradient>
  );
  return identified ? (
    <Pressable onPress={onOpen} testID={`passport-pub-${entry.location_key}`} accessibilityRole="button"
      accessibilityLabel={`Open ${entry.pub_name || 'pub'} details and reviews`}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>{content}</Pressable>
  ) : <View testID={`passport-location-${entry.location_key}`}>{content}</View>;
}
