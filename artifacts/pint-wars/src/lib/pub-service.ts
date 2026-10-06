import {
  findNearbyPubs as requestNearbyPubs,
  getNearbyPubPhotoUri as requestNearbyPubPhotoUri,
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

export async function getNearbyPubPhotoUri(photoName: string) {
  return requestNearbyPubPhotoUri({ photoName });
}