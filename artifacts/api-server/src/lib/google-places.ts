import type { NearbyPubSearch, NearbyPubsRequest } from "@workspace/api-zod";

const GOOGLE_NEARBY_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchNearby";
const GOOGLE_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.photos.name,places.photos.authorAttributions";
const GOOGLE_PHOTO_MEDIA_BASE_URL = "https://places.googleapis.com/v1/";
const SEARCH_RADIUS_METERS = 3_000;
const MAX_RESULTS = 10;
const EARTH_RADIUS_METERS = 6_371_000;
const REQUEST_TIMEOUT_MILLISECONDS = 5_000;
const PHOTO_MAX_WIDTH_PIXELS = 512;
const GOOGLE_PHOTO_NAME_PATTERN =
  /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const GOOGLE_PHOTO_HOST_PATTERN = /(^|\.)googleusercontent\.com$/i;

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
  googleMapsUri?: unknown;
  photos?: unknown;
};

type GooglePhotoAttribution = {
  displayName?: unknown;
  uri?: unknown;
  photoUri?: unknown;
};

type GooglePhoto = {
  name?: unknown;
  authorAttributions?: unknown;
};

type GoogleNearbyResponse = {
  places?: unknown;
};

type GooglePhotoMediaResponse = {
  photoUri?: unknown;
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

function normalizeHttpsUri(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const uri = new URL(
      value.startsWith("//") ? `https:${value}` : value,
    );
    return uri.protocol === "https:" ? uri.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizePhotoAttribution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const attribution = value as GooglePhotoAttribution;
  const displayName =
    typeof attribution.displayName === "string"
      ? attribution.displayName.trim()
      : "";
  const uri = normalizeHttpsUri(attribution.uri);
  const photoUri = normalizeHttpsUri(attribution.photoUri);

  if (!displayName && !uri && !photoUri) return null;

  return {
    ...(displayName ? { displayName } : {}),
    ...(uri ? { uri } : {}),
    ...(photoUri ? { photoUri } : {}),
  };
}

function normalizePhotos(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const firstPhoto = value[0] as GooglePhoto | undefined;
  const name =
    firstPhoto && typeof firstPhoto.name === "string"
      ? firstPhoto.name.trim()
      : "";

  if (
    !firstPhoto ||
    !name ||
    !GOOGLE_PHOTO_NAME_PATTERN.test(name)
  ) {
    return undefined;
  }

  const authorAttributions = Array.isArray(firstPhoto.authorAttributions)
    ? firstPhoto.authorAttributions
        .map(normalizePhotoAttribution)
        .filter(
          (attribution): attribution is NonNullable<typeof attribution> =>
            attribution !== null,
        )
    : [];

  return [{ name, authorAttributions }];
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
  const googleMapsUri = normalizeHttpsUri(place.googleMapsUri);
  const photos = normalizePhotos(place.photos);

  return {
    provider: "google_places" as const,
    placeId,
    name,
    address,
    distanceMeters: distanceMeters(origin, coordinates),
    coordinates,
    ...(googleMapsUri ? { googleMapsUri } : {}),
    ...(photos ? { photos } : {}),
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

export async function getGooglePlacePhotoUri(
  photoName: string,
): Promise<string> {
  if (
    photoName.length > 4096 ||
    !GOOGLE_PHOTO_NAME_PATTERN.test(photoName)
  ) {
    throw new PlacesServiceError(502, "This pub photo is unavailable.");
  }

  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) {
    throw new PlacesServiceError(
      503,
      "Nearby pub search is not configured.",
    );
  }

  const photoPath = photoName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const photoUrl = new URL(
    `${photoPath}/media`,
    GOOGLE_PHOTO_MEDIA_BASE_URL,
  );
  photoUrl.searchParams.set("maxWidthPx", String(PHOTO_MAX_WIDTH_PIXELS));
  photoUrl.searchParams.set("skipHttpRedirect", "true");

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MILLISECONDS,
  );
  try {
    response = await fetch(photoUrl, {
      headers: { "X-Goog-Api-Key": apiKey },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new PlacesServiceError(
      502,
      "This pub photo could not be loaded from Google Places.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new PlacesServiceError(
      502,
      "This pub photo could not be loaded from Google Places.",
    );
  }

  let payload: GooglePhotoMediaResponse;
  try {
    payload = (await response.json()) as GooglePhotoMediaResponse;
  } catch {
    throw new PlacesServiceError(
      502,
      "Google Places returned an invalid photo response.",
    );
  }

  const photoUri = normalizeHttpsUri(payload.photoUri);
  if (!photoUri) {
    throw new PlacesServiceError(
      502,
      "Google Places returned an invalid photo URI.",
    );
  }

  const parsedPhotoUri = new URL(photoUri);
  if (!GOOGLE_PHOTO_HOST_PATTERN.test(parsedPhotoUri.hostname)) {
    throw new PlacesServiceError(
      502,
      "Google Places returned an invalid photo URI.",
    );
  }

  return photoUri;
}