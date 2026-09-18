import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type { Coordinates } from '@/src/lib/pub-service';

export type CurrentLocationResult =
  | {
      status: 'success';
      coordinates: Coordinates;
    }
  | {
      status: 'permission-denied';
      canAskAgain: boolean;
    }
  | {
      status: 'unavailable';
      message: string;
    };

export async function getCurrentLocation(): Promise<CurrentLocationResult> {
  if (Platform.OS === 'web') {
    return {
      status: 'unavailable',
      message: 'Location is available in the Pint Wars mobile app.',
    };
  }

  try {
    const existingPermission = await Location.getForegroundPermissionsAsync();
    const permission = existingPermission.granted
      ? existingPermission
      : await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) {
      return {
        status: 'permission-denied',
        canAskAgain: permission.canAskAgain,
      };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = position.coords;

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return {
        status: 'unavailable',
        message: 'Your current location could not be read.',
      };
    }

    return {
      status: 'success',
      coordinates: { latitude, longitude },
    };
  } catch {
    return {
      status: 'unavailable',
      message: 'Your current location could not be read. Try again.',
    };
  }
}