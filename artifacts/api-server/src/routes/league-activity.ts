import { Router, type IRouter } from "express";
import { authenticateSupabaseBearer } from "../lib/supabase-auth";

const router: IRouter = Router();
const PINT_PROOF_BUCKET = "pint-proofs";
const ACTIVITY_WINDOW = 20;
const SCORE_EVENT_QUERY_LIMIT = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

type MembershipRow = {
  user_id: string;
  status: "active" | "retired";
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type ScoreEventRow = {
  id: string;
  user_id: string;
  event_type: "PINT_LOGGED" | "NEW_PUB" | "PUB_REVIEW";
  points: number;
  pint_log_id: string | null;
  created_at: string;
};

type PintLogRow = {
  id: string;
  user_id: string;
  photo_path: string;
  pub_name: string | null;
};

type LeagueActivityEvent = {
  id: string;
  type: "pint_logged" | "pub_review" | "legacy_pub_bonus";
  userId: string;
  playerName: string;
  occurredAt: string;
  pubName: string | null;
  scoreImpact: number | null;
  historicalScore: boolean;
  photoPintLogId: string | null;
};

type AccessResult =
  | {
      ok: true;
      config: SupabaseConfig;
      userId: string;
      memberships: MembershipRow[];
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  return url && serviceRoleKey
    ? { url: url.replace(/\/+$/, ""), serviceRoleKey }
    : null;
}

function serviceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function selectRows<T>(
  config: SupabaseConfig,
  table: string,
  query: Record<string, string>,
): Promise<T[]> {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: serviceHeaders(config.serviceRoleKey),
  });
  if (!response.ok) throw new Error("Supabase query failed.");
  return (await response.json()) as T[];
}

async function authorizeLeagueMember(
  authorization: string | undefined,
  leagueId: string,
): Promise<AccessResult> {
  const auth = await authenticateSupabaseBearer(authorization);
  if (!auth.authenticated) {
    return { ok: false, status: auth.status, message: auth.message };
  }

  if (!UUID_PATTERN.test(leagueId)) {
    return { ok: false, status: 400, message: "The Pint War could not be identified." };
  }

  const config = supabaseConfig();
  if (!config) {
    return { ok: false, status: 503, message: "Pint War activity is not configured." };
  }

  try {
    const memberships = await selectRows<MembershipRow>(
      config,
      "league_memberships",
      {
        select: "user_id,status,joined_at",
        league_id: `eq.${leagueId}`,
        status: "in.(active,retired)",
      },
    );

    if (!memberships.some((membership) => membership.user_id === auth.userId)) {
      return { ok: false, status: 403, message: "You are not a member of this Pint War." };
    }

    return { ok: true, config, userId: auth.userId, memberships };
  } catch {
    return { ok: false, status: 502, message: "Pint War access could not be verified." };
  }
}

function storageObjectUrl(url: string, photoPath: string) {
  const encodedPath = photoPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${url}/storage/v1/object/${PINT_PROOF_BUCKET}/${encodedPath}`;
}

function hasValidLeaguePhotoPath(photoPath: string, userId: string, leagueId: string) {
  return (
    photoPath.startsWith(`${userId}/${leagueId}/`) &&
    photoPath.split("/").length === 3 &&
    !photoPath.includes("..")
  );
}

function playerName(profiles: Map<string, string>, userId: string) {
  return profiles.get(userId) || "Player";
}

router.get("/pint-proofs/leagues/:leagueId/activity", async (req, res) => {
  const access = await authorizeLeagueMember(
    req.header("authorization"),
    req.params.leagueId,
  );
  if (!access.ok) {
    res.status(access.status).json({ message: access.message });
    return;
  }

  try {
    const scoreEvents = await selectRows<ScoreEventRow>(
      access.config,
      "league_score_events",
      {
        select: "id,user_id,event_type,points,pint_log_id,created_at",
        league_id: `eq.${req.params.leagueId}`,
        order: "created_at.desc",
        limit: String(SCORE_EVENT_QUERY_LIMIT),
      },
    );

    const memberIds = new Set(access.memberships.map(({ user_id }) => user_id));
    const feedUserIds = [
      ...new Set(scoreEvents.filter((event) => memberIds.has(event.user_id)).map((event) => event.user_id)),
    ];
    const profiles =
      feedUserIds.length > 0
        ? await selectRows<ProfileRow>(access.config, "profiles", {
            select: "id,display_name",
            id: `in.(${feedUserIds.join(",")})`,
          })
        : [];
    const profileNames = new Map(
      profiles.map((profile) => [profile.id, profile.display_name?.trim() || "Player"]),
    );
    const pintLogIds = [
      ...new Set(
        scoreEvents
          .map((event) => event.pint_log_id)
          .filter((id): id is string => id !== null && UUID_PATTERN.test(id)),
      ),
    ];
    const pintLogs =
      pintLogIds.length > 0
        ? await selectRows<PintLogRow>(access.config, "pint_logs", {
            select: "id,user_id,photo_path,pub_name",
            league_id: `eq.${req.params.leagueId}`,
            id: `in.(${pintLogIds.join(",")})`,
          })
        : [];
    const pintLogsById = new Map(pintLogs.map((pintLog) => [pintLog.id, pintLog]));

    const events: LeagueActivityEvent[] = scoreEvents.flatMap((event) => {
      if (!memberIds.has(event.user_id)) return [];

      const pintLog =
        event.pint_log_id ? pintLogsById.get(event.pint_log_id) : undefined;
      const matchingPintLog =
        pintLog?.user_id === event.user_id ? pintLog : undefined;
      const type: LeagueActivityEvent["type"] =
        event.event_type === "PINT_LOGGED"
          ? "pint_logged"
          : event.event_type === "PUB_REVIEW"
            ? "pub_review"
            : "legacy_pub_bonus";

      return [
        {
          id: event.id,
          type,
          userId: event.user_id,
          playerName: playerName(profileNames, event.user_id),
          occurredAt: event.created_at,
          pubName: matchingPintLog?.pub_name ?? null,
          scoreImpact: event.points,
          historicalScore:
            event.event_type === "NEW_PUB" ||
            (event.event_type === "PUB_REVIEW" && event.points !== 1),
          photoPintLogId:
            event.event_type === "PINT_LOGGED" &&
            matchingPintLog?.photo_path &&
            hasValidLeaguePhotoPath(
              matchingPintLog.photo_path,
              matchingPintLog.user_id,
              req.params.leagueId,
            )
              ? matchingPintLog.id
              : null,
        },
      ];
    });

    events.sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
    );
    res.json({ events: events.slice(0, ACTIVITY_WINDOW) });
  } catch {
    res.status(502).json({ message: "Pint War activity could not be loaded." });
  }
});

router.get(
  "/pint-proofs/leagues/:leagueId/photos/:pintLogId",
  async (req, res) => {
    const access = await authorizeLeagueMember(
      req.header("authorization"),
      req.params.leagueId,
    );
    if (!access.ok) {
      res.status(access.status).json({ message: access.message });
      return;
    }

    const pintLogId = req.params.pintLogId;
    if (!UUID_PATTERN.test(pintLogId)) {
      res.status(400).json({ message: "The proof photo could not be identified." });
      return;
    }

    try {
      const pintLogs = await selectRows<PintLogRow & { league_id: string }>(
        access.config,
        "pint_logs",
        {
          select: "id,user_id,league_id,photo_path,pub_name",
          id: `eq.${pintLogId}`,
          league_id: `eq.${req.params.leagueId}`,
          limit: "1",
        },
      );
      const pintLog = pintLogs[0];
      if (
        !pintLog ||
        !hasValidLeaguePhotoPath(
          pintLog.photo_path,
          pintLog.user_id,
          req.params.leagueId,
        )
      ) {
        res.status(404).json({ message: "This proof photo is unavailable." });
        return;
      }

      const proofResponse = await fetch(
        storageObjectUrl(access.config.url, pintLog.photo_path),
        { headers: serviceHeaders(access.config.serviceRoleKey) },
      );
      if (!proofResponse.ok) {
        res.status(404).json({ message: "This proof photo is unavailable." });
        return;
      }

      const contentType = proofResponse.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
        res.status(415).json({ message: "This proof photo format is not supported." });
        return;
      }

      const image = Buffer.from(await proofResponse.arrayBuffer());
      res.set({
        "Cache-Control": "private, no-store",
        "Content-Type": contentType,
        "Vary": "Authorization",
        "X-Content-Type-Options": "nosniff",
      });
      res.status(200).send(image);
    } catch {
      res.status(502).json({ message: "This proof photo could not be loaded." });
    }
  },
);

export default router;