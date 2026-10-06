import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { mapColors } from './NearbyPubStyles';
import type { PubMapProps } from './PubMap.types';

export function PubMap({
  coordinates: _coordinates,
  pubs: _pubs,
  onSelect: _onSelect,
}: PubMapProps) {
  const colors = mapColors;

  return (
    <View style={[styles.mapFallback, { backgroundColor: colors.map, borderColor: colors.line }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Map is available in the Pint Wars app</Text>
      <Text style={[styles.text, { color: colors.mutedForeground }]}>
        Open Pint Wars on your iPhone to view the interactive map and pub markers.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapFallback: {
    flex: 1,
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