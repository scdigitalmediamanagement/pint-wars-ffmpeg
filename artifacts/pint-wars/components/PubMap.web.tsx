import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Coordinates, NearbyPub } from '@/src/lib/pub-service';

export function PubMap({
  coordinates: _coordinates,
  pubs: _pubs,
  onSelect: _onSelect,
}: {
  coordinates: Coordinates;
  pubs: NearbyPub[];
  onSelect: (pub: NearbyPub) => void;
}) {
  const colors = useColors();

  return (
    <View style={[styles.mapFallback, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Map is available in the Pint Wars app</Text>
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        Open Pint Wars on your iPhone to view the interactive map and pub markers.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapFallback: {
    height: 320,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  text: {
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
    textAlign: 'center',
  },
});