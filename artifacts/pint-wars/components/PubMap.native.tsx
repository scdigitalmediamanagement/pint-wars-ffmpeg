import React from 'react';
import MapView, { Marker } from 'react-native-maps';
import type { Coordinates, NearbyPub } from '@/src/lib/pub-service';

export function PubMap({
  coordinates,
  pubs,
  onSelect,
}: {
  coordinates: Coordinates;
  pubs: NearbyPub[];
  onSelect: (pub: NearbyPub) => void;
}) {
  return (
    <MapView
      style={{ height: 320, borderRadius: 24, overflow: 'hidden' }}
      initialRegion={{
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
      showsUserLocation
      showsMyLocationButton
      accessibilityLabel="Map showing nearby pubs"
    >
      {pubs.map((pub) => (
        <Marker
          key={`${pub.provider}:${pub.placeId}`}
          coordinate={pub.coordinates}
          title={pub.name}
          description={`${formatDistance(pub.distanceMeters)} away`}
          onPress={() => onSelect(pub)}
        />
      ))}
    </MapView>
  );
}

function formatDistance(distanceMeters: number) {
  return distanceMeters < 1000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}