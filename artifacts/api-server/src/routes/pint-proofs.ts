import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { authenticateSupabaseBearer } from "../lib/supabase-auth";

const router: IRouter = Router();
const PINT_PROOF_BUCKET = "pint-proofs";
const DUPLICATE_PROOF_CODE = "DUPLICATE_PROOF";

type PubInput = {
  provider: string | null;
  placeId: string | null;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

type LogPintProofBody = {
  leagueId: string;
  photoPath: string;
  latitude: number | null;
  longitude: number | null;
  pub: PubInput | null;
};

type SupabaseErrorPayload = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined
    ? null
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
}

function nullableString(value: unknown) {
  return value === null || value === undefined
    ? null
    : typeof value === "string"
      ? value
      : undefined;
}

function parseBody(body: unknown): LogPintProofBody | null {
  if (!isRecord(body)) return null;

  const leagueId = body.leagueId;
  const photoPath = body.photoPath;
  const latitude = nullableNumber(body.latitude);
  const longitude = nullableNumber(body.longitude);

  if (
    typeof leagueId !== "string" ||
    !leagueId ||
    typeof photoPath !== "string" ||
    !photoPath ||
    latitude === undefined ||
    longitude === undefined
  ) {
    return null;
  }

  if (body.pub === null || body.pub === undefined) {
    return { leagueId, photoPath, latitude, longitude, pub: null };
  }

  if (!isRecord(body.pub)) return null;

  const provider = nullableString(body.pub.provider);
  const placeId = nullableString(body.pub.placeId);
  const name = nullableString(body.pub.name);
  const address = nullableString(body.pub.address);
  const pubLatitude = nullableNumber(body.pub.latitude);
  const pubLongitude = nullableNumber(body.pub.longitude);

  if (
    provider === undefined ||
    placeId === undefined ||
    name === undefined ||
    address === undefined ||
    pubLatitude === undefined ||
    pubLongitude === undefined
  ) {
    return null;
  }

  return {
    leagueId,
    photoPath,
    latitude,
    longitude,
    pub: {
      provider,
      placeId,
      name,
      address,
      latitude: pubLatitude,
      longitude: pubLongitude,
    },
  };
}

function supabaseConfig() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  return url && serviceRoleKey ? { url: url.replace(/\/+$/, ""), serviceRoleKey } : null;
}

function storageObjectUrl(url: string, photoPath: string) {
  const encodedPath = photoPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${url}/storage/v1/object/${PINT_PROOF_BUCKET}/${encodedPath}`;
}

function rpcUrl(url: string) {
  return `${url}/rest/v1/rpc/log_pint_verified`;
}

function serviceHeaders(serviceRoleKey: string, includeJson = false) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(includeJson ? { "content-type": "application/json" } : {}),
  };
}

async function readJsonOrText(response: Response): Promise<SupabaseErrorPayload | string> {
  const text = await response.text();
  if (!text) return "";
  try {
    return JSON.parse(text) as SupabaseErrorPayload;
  } catch {
    return text;
  }
}

function errorMessage(payload: SupabaseErrorPayload | string) {
  if (typeof payload === "string") return payload;
  return typeof payload.message === "string" ? payload.message : "";
}

function duplicateExistingPath(payload: SupabaseErrorPayload | string) {
  if (typeof payload === "string") return null;
  return typeof payload.details === "string" ? payload.details : null;
}

async function removeUploadedProof(url: string, serviceRoleKey: string, photoPath: string) {
  await fetch(storageObjectUrl(url, photoPath), {
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey),
  }).catch(() => undefined);
}

router.post("/pint-proofs/log", async (req, res) => {
  const auth = await authenticateSupabaseBearer(req.header("authorization"));
  if (!auth.authenticated) {
    res.status(auth.status).json({ message: auth.message });
    return;
  }

  const config = supabaseConfig();
  if (!config) {
    res.status(503).json({ message: "Pint proof logging is not configured." });
    return;
  }

  const body = parseBody(req.body);
  if (!body) {
    res.status(400).json({ message: "Pint proof details are invalid." });
    return;
  }

  const expectedPrefix = `${auth.userId}/${body.leagueId}/`;
  if (
    !body.photoPath.startsWith(expectedPrefix) ||
    body.photoPath.includes("..") ||
    body.photoPath.split("/").length !== 3
  ) {
    res.status(400).json({ message: "The pint proof path is invalid." });
    return;
  }

  let proofPersisted = false;
  try {
    const proofResponse = await fetch(storageObjectUrl(config.url, body.photoPath), {
      headers: serviceHeaders(config.serviceRoleKey),
    });

    if (!proofResponse.ok) {
      await removeUploadedProof(config.url, config.serviceRoleKey, body.photoPath);
      res.status(400).json({ message: "The pint proof photo could not be found." });
      return;
    }

    const photoBytes = await proofResponse.arrayBuffer();
    const contentSha256 = createHash("sha256")
      .update(Buffer.from(photoBytes))
      .digest("hex");
    const pub = body.pub;

    const rpcResponse = await fetch(rpcUrl(config.url), {
      method: "POST",
      headers: serviceHeaders(config.serviceRoleKey, true),
      body: JSON.stringify({
        p_user_id: auth.userId,
        p_league_id: body.leagueId,
        p_photo_path: body.photoPath,
        p_content_sha256: contentSha256,
        p_latitude: body.latitude,
        p_longitude: body.longitude,
        p_pub_provider: pub?.provider ?? null,
        p_pub_place_id: pub?.placeId ?? null,
        p_pub_name: pub?.name ?? null,
        p_pub_address: pub?.address ?? null,
        p_pub_latitude: pub?.latitude ?? null,
        p_pub_longitude: pub?.longitude ?? null,
      }),
    });

    if (!rpcResponse.ok) {
      const payload = await readJsonOrText(rpcResponse);
      const message = errorMessage(payload);
      const isDuplicate =
        message === "This photo has already been used in this Pint War." ||
        (typeof payload !== "string" && payload.code === "P0001");

      if (isDuplicate) {
        const existingPath = duplicateExistingPath(payload);
        if (existingPath !== body.photoPath) {
          await removeUploadedProof(config.url, config.serviceRoleKey, body.photoPath);
        }
        res.status(409).json({
          code: DUPLICATE_PROOF_CODE,
          message: "This photo has already been used in this Pint War.",
        });
        return;
      }

      await removeUploadedProof(config.url, config.serviceRoleKey, body.photoPath);
      res.status(400).json({
        message: message || "The pint could not be logged.",
      });
      return;
    }

    proofPersisted = true;
    res.json(await rpcResponse.json());
  } catch {
    if (!proofPersisted) {
      await removeUploadedProof(config.url, config.serviceRoleKey, body.photoPath);
    }
    res.status(502).json({ message: "The pint could not be logged right now." });
  }
});

export default router;