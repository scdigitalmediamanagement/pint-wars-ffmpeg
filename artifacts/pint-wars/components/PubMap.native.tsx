import React, { useEffect, useRef } from 'react';
import MapView, { Marker } from 'react-native-maps';
import type { PubMapProps } from './PubMap.types';
import { mapColors } from './NearbyPubStyles';

export function PubMap({
  coordinates,
  pubs,
  onSelect,
  recenterKey = 0,
}: PubMapProps) {
  const map = useRef<MapView>(null);
  useEffect(() => {
    map.current?.animateToRegion({
      ...coordinates,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  }, [coordinates.latitude, coordinates.longitude, recenterKey]);

  return (
    <MapView
      ref={map}
      style={{ flex: 1 }}
      userInterfaceStyle="dark"
      customMapStyle={[
        { elementType: 'geometry', stylers: [{ color: mapColors.map }] },
        { elementType: 'labels.text.fill', stylers: [{ color: mapColors.muted }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: mapColors.background }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: mapColors.road }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: mapColors.water }] },
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      ]}
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
          pinColor={mapColors.gold}
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