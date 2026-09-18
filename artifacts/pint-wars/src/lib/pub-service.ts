import {
  findNearbyPubs as requestNearbyPubs,
  type NearbyPub as ApiNearbyPub,
  type NearbyPubSearch,
} from '@workspace/api-client-react';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type NearbyPub = ApiNearbyPub;
export type { NearbyPubSearch };

export async function findNearbyPubs(
  location: Coordinates,
): Promise<NearbyPubSearch> {
  return requestNearbyPubs(location);
}