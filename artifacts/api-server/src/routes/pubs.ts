import {
  FindNearbyPubsBody,
  FindNearbyPubsResponse,
  GetNearbyPubPhotoUriQueryParams,
  GetNearbyPubPhotoUriResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  getGooglePlacePhotoUri,
  searchNearbyGooglePubs,
  PlacesServiceError,
} from "../lib/google-places";
import { authenticateSupabaseBearer } from "../lib/supabase-auth";

const router: IRouter = Router();
const SEARCH_LIMIT = 10;
const SEARCH_WINDOW_MILLISECONDS = 60_000;
const PHOTO_LIMIT = 120;
const PHOTO_WINDOW_MILLISECONDS = 60_000;
const searchWindows = new Map<
  string,
  { windowStartedAt: number; requestCount: number }
>();
const photoWindows = new Map<
  string,
  { windowStartedAt: number; requestCount: number }
>();

const GOOGLE_CONTENT_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization",
};

function canSearch(userId: string) {
  const now = Date.now();
  const current = searchWindows.get(userId);
  if (
    !current ||
    now - current.windowStartedAt >= SEARCH_WINDOW_MILLISECONDS
  ) {
    searchWindows.set(userId, { windowStartedAt: now, requestCount: 1 });
    return true;
  }

  if (current.requestCount >= SEARCH_LIMIT) return false;
  current.requestCount += 1;
  return true;
}

function canRequestPhoto(userId: string) {
  const now = Date.now();
  const current = photoWindows.get(userId);
  if (!current || now - current.windowStartedAt >= PHOTO_WINDOW_MILLISECONDS) {
    photoWindows.set(userId, { windowStartedAt: now, requestCount: 1 });
    return true;
  }

  if (current.requestCount >= PHOTO_LIMIT) return false;
  current.requestCount += 1;
  return true;
}

function hasOnlyCoordinateKeys(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body).every(
    (key) => key === "latitude" || key === "longitude",
  );
}

router.post("/pubs/nearby", async (req, res) => {
  res.set(GOOGLE_CONTENT_RESPONSE_HEADERS);

  const auth = await authenticateSupabaseBearer(req.header("authorization"));
  if (!auth.authenticated) {
    res.status(auth.status).json({ message: auth.message });
    return;
  }

  if (!hasOnlyCoordinateKeys(req.body)) {
    res.status(400).json({ message: "Latitude and longitude are invalid." });
    return;
  }

  const parsedBody = FindNearbyPubsBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ message: "Latitude and longitude are invalid." });
    return;
  }

  if (!canSearch(auth.userId)) {
    res.status(429).json({
      message: "Too many nearby pub searches. Please wait and try again.",
    });
    return;
  }

  try {
    const result = await searchNearbyGooglePubs(parsedBody.data);
    res.json(FindNearbyPubsResponse.parse(result));
  } catch (error) {
    if (error instanceof PlacesServiceError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    res.status(502).json({ message: "Nearby pubs could not be loaded." });
  }
});

router.get("/pubs/nearby/photo-uri", async (req, res) => {
  res.set(GOOGLE_CONTENT_RESPONSE_HEADERS);

  const auth = await authenticateSupabaseBearer(req.header("authorization"));
  if (!auth.authenticated) {
    res.status(auth.status).json({ message: auth.message });
    return;
  }

  const parsedParams = GetNearbyPubPhotoUriQueryParams.safeParse({
    photoName: req.query["photoName"],
  });
  if (!parsedParams.success) {
    res.status(400).json({ message: "This pub photo is unavailable." });
    return;
  }

  if (!canRequestPhoto(auth.userId)) {
    res.status(429).json({
      message: "Too many pub photo requests. Please wait and try again.",
    });
    return;
  }

  try {
    const result = {
      photoUri: await getGooglePlacePhotoUri(parsedParams.data.photoName),
    };
    res.json(GetNearbyPubPhotoUriResponse.parse(result));
  } catch (error) {
    if (error instanceof PlacesServiceError) {
      res.status(error.status).json({ message: error.message });
      return;
    }

    res.status(502).json({ message: "This pub photo could not be loaded." });
  }
});

export default router;