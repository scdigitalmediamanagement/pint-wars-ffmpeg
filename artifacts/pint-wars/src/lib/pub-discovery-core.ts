export type NearbyCoordinates = {
  latitude: number;
  longitude: number;
};

export type PubSearchPayload<TPub> = {
  pubs: TPub[];
  providerConfigured: boolean;
};

export type DiscoveryLog = {
  requestId: string;
  durationMs: number;
  stage: string;
  attempt?: number;
  status?: number;
  category?: string;
};

export type PubDiscoveryOptions = {
  forceRefresh?: boolean;
};

export type PubDiscoveryResult<TPub> = PubSearchPayload<TPub> & {
  isStale: boolean;
  cachedAt?: number;
  failureCategory?: string;
};

type CachedResult<TPub> = {
  location: NearbyCoordinates;
  cachedAt: number;
  result: PubSearchPayload<TPub>;
};

type DiscoveryDependencies<TPub> = {
  request: (
    location: NearbyCoordinates,
    requestId: string,
  ) => Promise<PubSearchPayload<TPub>>;
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
  log?: (event: DiscoveryLog) => void;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
  makeRequestId?: () => string;
};

const STORAGE_KEY = 'pint-wars.nearby-pubs.v1';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECENT_RESULT_MS = 20 * 1000;
const MAX_CACHE_ENTRIES = 3;
const MAX_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [250];
const MAX_CACHE_DISTANCE_METERS = 750;
const EARTH_RADIUS_METERS = 6_371_000;

export class PubDiscoveryError extends Error {
  readonly category: string;
  readonly status?: number;

  constructor(category: string, status?: number) {
    super(category);
    this.category = category;
    this.status = status;
    this.name = 'PubDiscoveryError';
  }
}

export function isValidNearbyCoordinates(
  value: NearbyCoordinates,
): boolean {
  return (
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

export function locationFailureMessage(
  status: 'permission-denied' | 'unavailable',
) {
  return status === 'permission-denied'
    ? 'Location is off. You can still log without a pub.'
    : 'We could not get your location. You can still log without a pub.';
}

export function resolveApiBaseUrl(domain: string | undefined) {
  const configuredDomain = domain?.trim();
  if (!configuredDomain) return null;
  try {
    const value = configuredDomain.includes('://')
      ? configuredDomain
      : `https://${configuredDomain}`;
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.pathname !== '/' && url.pathname !== '') ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function distanceMeters(a: NearbyCoordinates, b: NearbyCoordinates) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(longitudeDelta / 2) ** 2;
  const bounded = Math.max(0, Math.min(1, value));
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
}

function coarseLocation(value: NearbyCoordinates): NearbyCoordinates {
  return {
    latitude: Number(value.latitude.toFixed(3)),
    longitude: Number(value.longitude.toFixed(3)),
  };
}

function requestKey(location: NearbyCoordinates) {
  return `${location.latitude.toFixed(5)}:${location.longitude.toFixed(5)}`;
}

function cacheEntryIsValid<TPub>(value: unknown): value is CachedResult<TPub> {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CachedResult<TPub>>;
  return (
    Boolean(entry.location) &&
    typeof entry.location?.latitude === 'number' &&
    typeof entry.location?.longitude === 'number' &&
    typeof entry.cachedAt === 'number' &&
    Boolean(entry.result) &&
    Array.isArray(entry.result?.pubs) &&
    typeof entry.result?.providerConfigured === 'boolean'
  );
}

function statusOf(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function errorCategory(error: unknown) {
  if (error instanceof PubDiscoveryError) return error.category;
  const status = statusOf(error);
  if (error && typeof error === 'object') {
    const headers = (error as { headers?: { get?: (key: string) => string | null } }).headers;
    const serverCategory = headers?.get?.('x-pub-discovery-category');
    if (serverCategory && /^[a-z_]{1,48}$/.test(serverCategory)) return serverCategory;
    const data = (error as { data?: { message?: unknown } }).data;
    if (typeof data?.message === 'string' && /not configured/i.test(data.message)) {
      return 'configuration';
    }
    if (typeof data?.message === 'string' && /authentication/i.test(data.message)) {
      return 'authentication_service';
    }
  }
  if (status === 400) return 'invalid_location';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limit';
  if (status === 503) return 'service_unavailable';
  if (status === 502) return 'google_places_failure';
  if (status && status >= 500) return 'server_failure';
  if (error instanceof TypeError) return 'client_network';
  return 'request_failed';
}

function isRetryable(error: unknown) {
  if (error instanceof PubDiscoveryError) {
    return error.category === 'client_timeout' || error.category === 'client_network';
  }
  const status = statusOf(error);
  if (status === 502 || (status !== undefined && status >= 500 && status !== 503)) {
    return true;
  }
  if (status !== undefined) return false;
  return error instanceof TypeError ||
    (error instanceof Error && error.name === 'AbortError');
}

function defaultRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPubDiscoveryService<TPub>(
  dependencies: DiscoveryDependencies<TPub>,
) {
  const now = dependencies.now ?? Date.now;
  const wait =
    dependencies.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const makeRequestId = dependencies.makeRequestId ?? defaultRequestId;
  const inFlight = new Map<string, Promise<PubDiscoveryResult<TPub>>>();
  const log = (event: DiscoveryLog) => {
    try {
      dependencies.log?.(event);
    } catch {
      // Diagnostics must never affect discovery.
    }
  };

  async function readCache(): Promise<CachedResult<TPub>[]> {
    try {
      const raw = await dependencies.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is CachedResult<TPub> =>
        cacheEntryIsValid<TPub>(entry),
      );
    } catch {
      return [];
    }
  }

  async function saveCache(entry: CachedResult<TPub>, requestId: string, durationMs: number) {
    try {
      const previous = await readCache();
      const next = [
        entry,
        ...previous.filter(
          (saved) =>
            distanceMeters(saved.location, entry.location) > MAX_CACHE_DISTANCE_METERS,
        ),
      ].slice(0, MAX_CACHE_ENTRIES);
      await dependencies.storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      log({
        requestId,
        durationMs,
        stage: 'cache_write',
        category: 'local_storage_unavailable',
      });
    }
  }

  async function findCached(location: NearbyCoordinates) {
    const entries = await readCache();
    const timestamp = now();
    return entries
      .filter(
        (entry) =>
          timestamp - entry.cachedAt >= 0 &&
          timestamp - entry.cachedAt <= CACHE_MAX_AGE_MS &&
          distanceMeters(location, entry.location) <= MAX_CACHE_DISTANCE_METERS,
      )
      .sort((a, b) => b.cachedAt - a.cachedAt)[0];
  }

  async function findNearbyPubs(
    location: NearbyCoordinates,
    options: PubDiscoveryOptions = {},
  ): Promise<PubDiscoveryResult<TPub>> {
    const requestId = makeRequestId();
    const startedAt = now();
    const elapsed = () => Math.max(0, now() - startedAt);

    if (!isValidNearbyCoordinates(location)) {
      log({
        requestId,
        durationMs: elapsed(),
        stage: 'validate_location',
        category: 'invalid_location',
      });
      throw new PubDiscoveryError('invalid_location', 400);
    }

    const key = requestKey(location);
    const existing = inFlight.get(key);
    if (existing) return existing;
    if (!options.forceRefresh) {
      const recent = await findCached(location);
      const requestStartedWhileReadingCache = inFlight.get(key);
      if (requestStartedWhileReadingCache) return requestStartedWhileReadingCache;
      if (recent && now() - recent.cachedAt <= RECENT_RESULT_MS) {
        log({
          requestId,
          durationMs: elapsed(),
          stage: 'cache_read',
          category: 'recent_result',
        });
        return { ...recent.result, isStale: true, cachedAt: recent.cachedAt };
      }
    }

    const operation = (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          const result = await dependencies.request(location, requestId);
          const finishedAt = now();
          log({
            requestId,
            durationMs: Math.max(0, finishedAt - startedAt),
            stage: 'complete',
            attempt,
            status: 200,
            category: result.pubs.length ? 'success' : 'empty_results',
          });
          if (result.providerConfigured) {
            await saveCache(
              { location: coarseLocation(location), cachedAt: finishedAt, result },
              requestId,
              Math.max(0, finishedAt - startedAt),
            );
          }
          return { ...result, isStale: false };
        } catch (error) {
          lastError = error;
          const status = statusOf(error);
          const category = errorCategory(error);
          log({
            requestId,
            durationMs: elapsed(),
            stage:
              error instanceof PubDiscoveryError &&
              error.category === 'invalid_api_base_url'
                ? 'validate_api_base_url'
                : 'api_request',
            attempt,
            ...(status !== undefined ? { status } : {}),
            category,
          });
          if (attempt >= MAX_ATTEMPTS || !isRetryable(error)) break;
          await wait(RETRY_DELAYS_MS[attempt - 1] ?? 250);
        }
      }

      const cached = await findCached(location);
      if (cached) {
        return {
          ...cached.result,
          isStale: true,
          cachedAt: cached.cachedAt,
          failureCategory: errorCategory(lastError),
        };
      }
      throw new PubDiscoveryError(errorCategory(lastError), statusOf(lastError));
    })();

    inFlight.set(key, operation);
    try {
      return await operation;
    } finally {
      if (inFlight.get(key) === operation) inFlight.delete(key);
    }
  }

  return { findNearbyPubs };
}
