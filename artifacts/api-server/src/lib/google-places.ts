import type { NearbyPubSearch, NearbyPubsRequest } from "@workspace/api-zod";

const GOOGLE_NEARBY_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchNearby";
const GOOGLE_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location";
const SEARCH_RADIUS_METERS = 500;
const MAX_RESULTS = 10;
const EARTH_RADIUS_METERS = 6_371_000;
const REQUEST_TIMEOUT_MILLISECONDS = 5_000;

type GooglePlace = {
  id?: unknown;
  displayName?: {
    text?: unknown;
  };
  formattedAddress?: unknown;
  location?: {
    latitude?: unknown;
    longitude?: unknown;
  };
};

type GoogleNearbyResponse = {
  places?: unknown;
};

export class PlacesServiceError extends Error {
  constructor(
    readonly status: 502 | 503,
    message: string,
  ) {
    super(message);
    this.name = "PlacesServiceError";
  }
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: NearbyPubsRequest,
  to: { latitude: number; longitude: number },
) {
  const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
  const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
  const fromLatitude = degreesToRadians(from.latitude);
  const toLatitude = degreesToRadians(to.latitude);

  const haversineValue =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const haversine = Math.max(0, Math.min(1, haversineValue));

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function normalizePlace(place: GooglePlace, origin: NearbyPubsRequest) {
  const placeId = typeof place.id === "string" ? place.id.trim() : "";
  const name =
    typeof place.displayName?.text === "string"
      ? place.displayName.text.trim()
      : "";
  const address =
    typeof place.formattedAddress === "string"
      ? place.formattedAddress.trim()
      : "";
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;

  if (
    !placeId ||
    !name ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const coordinates = { latitude, longitude };
  return {
    provider: "google_places" as const,
    placeId,
    name,
    address,
    distanceMeters: distanceMeters(origin, coordinates),
    coordinates,
  };
}

export async function searchNearbyGooglePubs(
  location: NearbyPubsRequest,
): Promise<NearbyPubSearch> {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) {
    throw new PlacesServiceError(
      503,
      "Nearby pub search is not configured.",
    );
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MILLISECONDS,
  );
  try {
    response = await fetch(GOOGLE_NEARBY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: ["pub"],
        maxResultCount: MAX_RESULTS,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: {
            center: location,
            radius: SEARCH_RADIUS_METERS,
          },
        },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new PlacesServiceError(
      502,
      "Nearby pubs could not be loaded from Google Places.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new PlacesServiceError(
      502,
      "Nearby pubs could not be loaded from Google Places.",
    );
  }

  let payload: GoogleNearbyResponse;
  try {
    payload = (await response.json()) as GoogleNearbyResponse;
  } catch {
    throw new PlacesServiceError(
      502,
      "Google Places returned an invalid response.",
    );
  }

  const places = Array.isArray(payload.places)
    ? (payload.places as GooglePlace[])
    : [];
  const pubs = places
    .map((place) => normalizePlace(place, location))
    .filter((place): place is NonNullable<typeof place> => place !== null)
    .slice(0, MAX_RESULTS);

  return {
    pubs,
    providerConfigured: true,
  };
}