export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type NearbyPub = {
  provider: string;
  placeId: string;
  name: string;
  address: string;
  distanceMeters: number;
  coordinates: Coordinates;
};

export type NearbyPubSearch = {
  pubs: NearbyPub[];
  providerConfigured: boolean;
};

/**
 * Places provider boundary.
 *
 * Supabase is the only configured integration, so Stage 2 deliberately returns
 * no invented places. A provider can implement this function without changing
 * the camera, confirmation, or pint logging flow.
 */
export async function findNearbyPubs(_location: Coordinates): Promise<NearbyPubSearch> {
  return {
    pubs: [],
    providerConfigured: false,
  };
}