import React from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { PubMap } from '@/components/PubMap';
import { getNearbyPubPhotoUri, type Coordinates, type NearbyPub } from '@/src/lib/pub-service';
import type { ReviewSummary } from '@/src/lib/review-service';
import { createNearbyStyles, mapColors as c, type NearbyStyles } from './NearbyPubStyles';

const actionStyles = createNearbyStyles(false);
export function NearbyAction({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
    style={({ pressed }) => [actionStyles.view, { paddingHorizontal: 12, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
    <Text style={actionStyles.viewText}>{label}</Text>
  </Pressable>;
}

export type NearbyFilter = 'Nearby' | 'Top Rated' | 'Not Visited';
export function pubRating(summary: ReviewSummary | null | undefined): number | null {
  if (!summary || summary.review_count <= 0) return null;
  const ratings = [summary.average_atmosphere, summary.average_pints_drinks, summary.average_staff, summary.average_music];
  if (!ratings.every((value) => value !== null && Number.isFinite(value))) return null;
  return ratings.reduce<number>((sum, value) => sum + (value ?? 0), 0) / ratings.length;
}
export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function openExternalLink(uri: string) {
  void Linking.openURL(uri).catch(() => undefined);
}

function NearbyPubPhoto({ pub, s }: { pub: NearbyPub; s: NearbyStyles }) {
  const photo = pub.photos?.[0];
  const [photoUri, setPhotoUri] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(Boolean(photo));
  const [failed, setFailed] = React.useState(false);
  const [viewerOpen, setViewerOpen] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    setPhotoUri(null);
    setFailed(false);
    setLoading(Boolean(photo));
    if (!photo) return () => { active = false; };

    void getNearbyPubPhotoUri(photo.name).then(({ photoUri: uri }) => {
      if (!active) return;
      setPhotoUri(uri);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setFailed(true);
      setLoading(false);
    });

    return () => { active = false; };
  }, [photo?.name]);

  const fallbackLabel = photo && loading ? 'Loading photo' : 'No venue photo';

  return (
    <>
      <Pressable
        onPress={(event) => { event.stopPropagation(); setViewerOpen(true); }}
        disabled={!photoUri || failed}
        accessibilityRole="button"
        accessibilityLabel={photoUri ? `View the photo and credits for ${pub.name}` : `${fallbackLabel} for ${pub.name}`}
        style={s.photo}
      >
        {photoUri && !failed ? (
          <ExpoImage
            source={{ uri: photoUri }}
            cachePolicy="none"
            contentFit="cover"
            onError={() => setFailed(true)}
            accessibilityLabel={`Google Places photo of ${pub.name}`}
            style={s.photoImage}
          />
        ) : loading ? (
          <ActivityIndicator size="small" color={c.gold} />
        ) : (
          <View style={s.photoEmpty}>
            <Feather name="image" size={16} color={c.muted} />
            <Text style={s.photoEmptyText}>No venue photo</Text>
          </View>
        )}
        {photoUri && !failed ? <Text style={s.photoLabel}>PHOTO & CREDITS</Text> : null}
      </Pressable>

      {photoUri && photo ? (
        <Modal
          visible={viewerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setViewerOpen(false)}
          statusBarTranslucent
        >
          <View style={s.photoModalBackdrop}>
            <View style={s.photoModal}>
              <View style={s.photoModalHeader}>
                <Text style={s.photoModalTitle} numberOfLines={2}>{pub.name}</Text>
                <Pressable
                  onPress={() => setViewerOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close photo"
                  style={s.photoModalClose}
                >
                  <Feather name="x" size={21} color={c.text} />
                </Pressable>
              </View>
              <ExpoImage
                source={{ uri: photoUri }}
                cachePolicy="none"
                contentFit="contain"
                accessibilityLabel={`Google Places photo of ${pub.name}`}
                style={s.photoViewerImage}
              />
              <Text style={s.photoAttributionHeading}>PHOTO CREDIT</Text>
              {photo.authorAttributions.length > 0 ? (
                <ScrollView style={s.photoAttributionList}>
                  {photo.authorAttributions.map((author, index) => {
                    const label = author.displayName || 'Google Maps contributor';
                    return (
                      <View
                        key={`${author.uri ?? label}-${index}`}
                        style={s.photoAttributionRow}
                      >
                        {author.photoUri ? (
                          <ExpoImage
                            source={{ uri: author.photoUri }}
                            cachePolicy="none"
                            contentFit="cover"
                            accessibilityLabel={`${label} profile photo`}
                            style={s.photoAuthorAvatar}
                          />
                        ) : (
                          <View style={s.photoAuthorFallback}>
                            <Feather name="user" size={14} color={c.muted} />
                          </View>
                        )}
                        {author.uri ? (
                          <Pressable
                            onPress={() => openExternalLink(author.uri!)}
                            accessibilityRole="link"
                          >
                            <Text style={s.photoAuthorLink}>{label}</Text>
                          </Pressable>
                        ) : (
                          <Text style={s.photoAuthorLink}>{label}</Text>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={s.stateText}>No contributor attribution was supplied.</Text>
              )}
              {pub.googleMapsUri ? (
                <Pressable
                  onPress={() => openExternalLink(pub.googleMapsUri!)}
                  accessibilityRole="link"
                  style={s.photoSourceLink}
                >
                  <Feather name="map" size={15} color={c.gold} />
                  <Text style={s.photoSourceText}>View this pub on Google Maps</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

export function NearbyPubCard({ pub, summary, visited, ratingLoading, ratingFailed, onOpen, s }: {
  pub: NearbyPub; summary: ReviewSummary | null | undefined; visited: boolean;
  ratingLoading: boolean; ratingFailed: boolean; onOpen: () => void; s: NearbyStyles;
}) {
  const rating = pubRating(summary);
  return (
    <View style={s.pubRow}>
      <NearbyPubPhoto key={pub.photos?.[0]?.name ?? `${pub.placeId}:no-photo`} pub={pub} s={s} />
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`View ${pub.name}, ${formatDistance(pub.distanceMeters)} away`}
        style={({ pressed }) => [s.pubCardAction, pressed && { opacity: 0.8 }]}
      >
        <View style={s.pubCopy}>
          <Text style={s.pubName} numberOfLines={2}>{pub.name}</Text>
          <Text style={s.pubAddress} numberOfLines={1}>{pub.address || 'Address unavailable'}</Text>
          <View style={s.detailRow}>
            <Text style={s.pubDistance}>{formatDistance(pub.distanceMeters)}</Text>
            {visited ? <Text style={s.visited}>✓ VISITED</Text> : null}
          </View>
          <View style={s.detailRow}>
            {rating !== null ? <><FontAwesome name="star" size={11} color={c.gold} /><Text style={s.rating}>{rating.toFixed(1)}</Text><Text style={s.reviewCount}>({summary?.review_count} {summary?.review_count === 1 ? 'review' : 'reviews'})</Text></> :
              <Text style={s.reviewCount}>{ratingLoading ? 'Loading ratings…' : ratingFailed ? 'Ratings unavailable' : summary?.review_count ? `${summary.review_count} reviews · rating unavailable` : 'No community reviews yet'}</Text>}
          </View>
        </View>
        <View style={s.view}><Text style={s.viewText}>View</Text></View>
      </Pressable>
    </View>
  );
}

export function NearbyDiscovery({ s, coordinates, pubs, count, query, onQuery, filter, onFilter, canFilterVisited, onOpen, onRefresh, onLocation, busy, recenterKey, bottomInset, children }: {
  s: NearbyStyles; coordinates: Coordinates | null; pubs: NearbyPub[]; count: number | null;
  query: string; onQuery: (value: string) => void; filter: NearbyFilter; onFilter: (filter: NearbyFilter) => void;
  canFilterVisited: boolean; onOpen: (pub: NearbyPub) => void; onRefresh: () => void;
  onLocation: () => void; busy: boolean; recenterKey: number; bottomInset: number; children: React.ReactNode;
}) {
  return (
    <View style={[s.container, { paddingBottom: bottomInset }]}>
      <View style={s.header}>
        <View style={s.brand} accessible accessibilityLabel="Pint Wars">
          <Image source={require('@/assets/images/home/pw-reference-crest.png')} resizeMode="contain" style={s.crest} />
          <Image source={require('@/assets/images/home/pw-reference-wordmark.png')} resizeMode="contain" style={s.wordmark} />
        </View>
        <Pressable style={s.locationChip} onPress={onLocation} accessibilityRole="button" accessibilityLabel="Refresh your current location">
          <Feather name="map-pin" color={c.gold} size={11} /><Text style={s.chipText}>NEAR YOU</Text>
        </Pressable>
      </View>
      <View style={s.titleRow}>
        <View><Text style={s.eyebrow}>A GOOD NIGHT STARTS LOCAL</Text><Text style={s.title} accessibilityRole="header">Nearby Pubs</Text></View>
        <View style={s.countRow}><Text style={s.count}>{count ?? '—'}</Text><Text style={s.countLabel}>LOCALS</Text></View>
      </View>
      <View style={s.search}>
        <Feather name="search" size={15} color={c.muted} />
        <TextInput style={s.input} value={query} onChangeText={onQuery} placeholder="Search this area" placeholderTextColor={c.muted} accessibilityLabel="Search nearby pubs by name or address" returnKeyType="search" autoCorrect={false} />
        {query ? <Pressable onPress={() => onQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear pub search"><Feather name="x" size={16} color={c.muted} /></Pressable> : null}
      </View>
      <View style={s.filters}>
        {(['Nearby', 'Top Rated', 'Not Visited'] as const).map((item) => {
          const active = filter === item;
          const disabled = item === 'Not Visited' && !canFilterVisited;
          return <Pressable key={item} disabled={disabled} onPress={() => onFilter(item)} accessibilityRole="button" accessibilityState={{ selected: active, disabled }} style={[s.filter, active && s.activeFilter, disabled && s.disabled]}>
            <Feather name={item === 'Nearby' ? 'navigation' : item === 'Top Rated' ? 'star' : 'compass'} size={11} color={active ? c.actionInk : c.muted} />
            <Text style={[s.filterText, active && s.activeFilterText]}>{item}</Text>
          </Pressable>;
        })}
      </View>
      <View style={s.mapArea}>
        {coordinates ? <PubMap coordinates={coordinates} pubs={pubs} onSelect={onOpen} recenterKey={recenterKey} /> :
          <View style={s.mapAwaiting}><Feather name="map" size={36} color={c.gold} /><Text style={s.mapMessage}>Your nearby map{'\n'}Find local pubs using your current location.</Text></View>}
        {coordinates ? <>
          <Pressable style={s.recenter} onPress={onLocation} accessibilityRole="button" accessibilityLabel="Recenter map and update your location"><Feather name="navigation" size={18} color={c.gold} /></Pressable>
          <Pressable style={s.mapLocation} onPress={onLocation} accessibilityRole="button" accessibilityLabel="Refresh your current location"><Feather name="map-pin" size={12} color={c.gold} /><Text style={s.locationText}>Current location</Text></Pressable>
        </> : null}
      </View>
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.sheetHeading}>
          <View><Text style={s.eyebrow}>AROUND THE CORNER</Text><Text style={s.sectionTitle}>Good locals nearby</Text></View>
          <Pressable onPress={onRefresh} style={s.refresh} disabled={busy} accessibilityRole="button" accessibilityLabel="Refresh nearby pubs">
            {busy ? <ActivityIndicator size="small" color={c.gold} /> : <Feather name="refresh-cw" size={17} color={c.gold} />}
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.list}>{children}</ScrollView>
      </View>
    </View>
  );
}
