import { FindNearbyPubsBody, FindNearbyPubsResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { searchNearbyGooglePubs, PlacesServiceError } from "../lib/google-places";
import { authenticateSupabaseBearer } from "../lib/supabase-auth";

const router: IRouter = Router();
const SEARCH_LIMIT = 10;
const SEARCH_WINDOW_MILLISECONDS = 60_000;
const searchWindows = new Map<
  string,
  { windowStartedAt: number; requestCount: number }
>();

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

function hasOnlyCoordinateKeys(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body).every(
    (key) => key === "latitude" || key === "longitude",
  );
}

router.post("/pubs/nearby", async (req, res) => {
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

export default router;