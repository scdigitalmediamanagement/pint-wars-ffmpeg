import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  findNearbyPubs as requestNearbyPubs,
  getNearbyPubPhotoUri as requestNearbyPubPhotoUri,
  type NearbyPub as ApiNearbyPub,
  type NearbyPubSearch,
} from '@workspace/api-client-react';
import {
  createPubDiscoveryService,
  PubDiscoveryError,
  resolveApiBaseUrl,
  type NearbyCoordinates,
} from '@/src/lib/pub-discovery-core';

export type Coordinates = NearbyCoordinates;

export type NearbyPub = ApiNearbyPub;
export type { NearbyPubSearch };

export { PubDiscoveryError };
export type { PubDiscoveryResult } from '@/src/lib/pub-discovery-core';

const discovery = createPubDiscoveryService<NearbyPub>({
  storage: AsyncStorage,
  request: (location, requestId) => {
    if (!resolveApiBaseUrl(process.env.EXPO_PUBLIC_DOMAIN)) {
      throw new PubDiscoveryError('invalid_api_base_url');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9_000);
    return requestNearbyPubs(location, {
      headers: { 'X-Request-ID': requestId },
      signal: controller.signal,
    }).catch((error: unknown) => {
      if (controller.signal.aborted) throw new PubDiscoveryError('client_timeout');
      throw error;
    }).finally(() => clearTimeout(timeout));
  },
  log: (event) => {
    const diagnostic = {
      feature: 'pub_discovery',
      ...event,
    };
    if (event.category === 'success' || event.category === 'empty_results') {
      console.info('[Pint Wars]', diagnostic);
    } else {
      console.warn('[Pint Wars]', diagnostic);
    }
  },
});

export function findNearbyPubs(location: Coordinates, options?: { forceRefresh?: boolean }) {
  return discovery.findNearbyPubs(location, options);
}

export async function getNearbyPubPhotoUri(photoName: string) {
  return requestNearbyPubPhotoUri({ photoName });
}