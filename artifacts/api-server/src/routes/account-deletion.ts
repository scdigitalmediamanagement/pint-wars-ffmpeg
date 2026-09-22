import { Router, type IRouter } from "express";
import { authenticateSupabaseBearer } from "../lib/supabase-auth";

const router: IRouter = Router();
const PINT_PROOF_BUCKET = "pint-proofs";
const ACCOUNT_DELETION_RPC = "delete_my_account";

type SupabaseErrorPayload = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

type AccountDeletionResult = {
  storage_prefix?: unknown;
  user_id?: unknown;
};

type StorageListEntry = {
  id?: unknown;
  name?: unknown;
};

function supabaseConfig() {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  return url && serviceRoleKey
    ? { url: url.replace(/\/+$/, ""), serviceRoleKey }
    : null;
}

function serviceHeaders(serviceRoleKey: string, includeJson = false) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(includeJson ? { "content-type": "application/json" } : {}),
  };
}

function userRpcHeaders(
  serviceRoleKey: string,
  authorization: string,
) {
  return {
    apikey: serviceRoleKey,
    Authorization: authorization,
    "content-type": "application/json",
  };
}

async function readJsonOrText(
  response: Response,
): Promise<unknown> {
  const text = await response.text();
  if (!text) return "";
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(payload: unknown) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const message = (payload as SupabaseErrorPayload).message;
  return typeof message === "string" ? message : "";
}

function storageObjectUrl(url: string, objectPath: string) {
  const encodedPath = objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${url}/storage/v1/object/${PINT_PROOF_BUCKET}/${encodedPath}`;
}

async function deidentifyAccount(
  url: string,
  serviceRoleKey: string,
  authorization: string,
) {
  const response = await fetch(`${url}/rest/v1/rpc/${ACCOUNT_DELETION_RPC}`, {
    method: "POST",
    headers: userRpcHeaders(serviceRoleKey, authorization),
    body: "{}",
  });
  const payload = await readJsonOrText(response);

  if (!response.ok) {
    const message = errorMessage(payload);
    throw new Error(message || "Account deletion could not be completed.");
  }

  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new Error("Account deletion returned an invalid result.");
  }

  return payload[0] as AccountDeletionResult;
}

async function listStorageObjects(
  url: string,
  serviceRoleKey: string,
  storagePrefix: string,
) {
  const objectPaths: string[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const response = await fetch(
      `${url}/storage/v1/object/list/${PINT_PROOF_BUCKET}`,
      {
        method: "POST",
        headers: serviceHeaders(serviceRoleKey, true),
        body: JSON.stringify({
          prefix: storagePrefix,
          limit: pageSize,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
      },
    );
    const payload = await readJsonOrText(response);

    if (!response.ok) {
      throw new Error(
        errorMessage(payload) || "Pint-proof Storage could not be listed.",
      );
    }

    if (!Array.isArray(payload)) {
      throw new Error("Pint-proof Storage returned an invalid listing.");
    }

    for (const entry of payload as StorageListEntry[]) {
      if (typeof entry.id !== "string" || typeof entry.name !== "string") {
        continue;
      }

      const objectPath = entry.name.startsWith(storagePrefix)
        ? entry.name
        : `${storagePrefix}${entry.name}`;

      if (objectPath.startsWith(storagePrefix)) {
        objectPaths.push(objectPath);
      }
    }

    if (payload.length < pageSize) break;
    offset += payload.length;
  }

  return objectPaths;
}

async function deleteStorageObjects(
  url: string,
  serviceRoleKey: string,
  storagePrefix: string,
) {
  const objectPaths = await listStorageObjects(
    url,
    serviceRoleKey,
    storagePrefix,
  );

  for (const objectPath of objectPaths) {
    const response = await fetch(storageObjectUrl(url, objectPath), {
      method: "DELETE",
      headers: serviceHeaders(serviceRoleKey),
    });

    if (!response.ok && response.status !== 404) {
      const payload = await readJsonOrText(response);
      throw new Error(
        errorMessage(payload) || "Pint-proof Storage cleanup failed.",
      );
    }
  }
}

async function neutralizeAuthUser(
  url: string,
  serviceRoleKey: string,
  userId: string,
) {
  const response = await fetch(
    `${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: serviceHeaders(serviceRoleKey, true),
      body: JSON.stringify({
        ban_duration: "876000h",
        user_metadata: {},
      }),
    },
  );
  const payload = await readJsonOrText(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload) || "Auth account neutralization failed.",
    );
  }
}

router.post("/account/delete", async (req, res) => {
  const authorization = req.header("authorization");
  const auth = await authenticateSupabaseBearer(authorization);
  if (!auth.authenticated) {
    res.status(auth.status).json({ message: auth.message });
    return;
  }

  const config = supabaseConfig();
  if (!config) {
    res.status(503).json({ message: "Account deletion is not configured." });
    return;
  }

  try {
    const deletion = await deidentifyAccount(
      config.url,
      config.serviceRoleKey,
      authorization ?? "",
    );

    if (
      deletion.user_id !== auth.userId ||
      typeof deletion.storage_prefix !== "string" ||
      deletion.storage_prefix !== `${auth.userId}/`
    ) {
      throw new Error("Account deletion returned an invalid account identity.");
    }

    await deleteStorageObjects(
      config.url,
      config.serviceRoleKey,
      deletion.storage_prefix,
    );

    await neutralizeAuthUser(config.url, config.serviceRoleKey, auth.userId);

    res.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Account deletion failed.";

    if (
      message.includes("active Pint War") ||
      message.includes("signed in") ||
      message.includes("profile could not be found")
    ) {
      res.status(400).json({ message });
      return;
    }

    res.status(502).json({
      message: "Account deletion could not be completed right now.",
    });
  }
});

export default router;