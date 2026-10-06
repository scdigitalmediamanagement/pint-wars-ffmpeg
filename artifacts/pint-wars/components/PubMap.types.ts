import type { Coordinates, NearbyPub } from '@/src/lib/pub-service';

export type PubMapProps = {
  coordinates: Coordinates;
  pubs: NearbyPub[];
  onSelect: (pub: NearbyPub) => void;
  recenterKey?: number;
};
