import { Router, type IRouter } from "express";
import { authenticateSupabaseBearer } from "../lib/supabase-auth";

const router: IRouter = Router();
const PINT_PROOF_BUCKET = "pint-proofs";
const ACCOUNT_DELETION_RPC = "delete_my_account";
const ACCOUNT_DELETION_REPAIR_HEADER = "x-account-deletion-repair-key";

type SupabaseErrorPayload = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

type AccountDeletionResult = {
  job_id?: unknown;
  storage_prefix?: unknown;
  user_id?: unknown;
};

type StorageListEntry = {
  id?: unknown;
  name?: unknown;
};

type AccountDeletionJob = {
  id?: unknown;
  user_id?: unknown;
  storage_prefix?: unknown;
  deidentified_at?: unknown;
  storage_cleaned_at?: unknown;
  auth_neutralized_at?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function deletionJobUrl(url: string, jobId: string) {
  return `${url}/rest/v1/account_deletion_jobs?id=eq.${encodeURIComponent(jobId)}`;
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
  const objectPaths = new Set<string>();
  const pendingPrefixes = [storagePrefix];
  const visitedPrefixes = new Set<string>();
  const pageSize = 1000;

  while (pendingPrefixes.length > 0) {
    const currentPrefix = pendingPrefixes.shift();
    if (!currentPrefix || visitedPrefixes.has(currentPrefix)) continue;
    visitedPrefixes.add(currentPrefix);

    let offset = 0;
    while (true) {
      const response = await fetch(
        `${url}/storage/v1/object/list/${PINT_PROOF_BUCKET}`,
        {
          method: "POST",
          headers: serviceHeaders(serviceRoleKey, true),
          body: JSON.stringify({
            prefix: currentPrefix,
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
        if (typeof entry.name !== "string" || entry.name.length === 0) {
          continue;
        }

        // Storage can return folder entries without an object id. Treat every
        // name as a deletion candidate, then recurse into it as a prefix. This
        // avoids leaving nested objects behind when the listing shape changes.
        const objectPath = entry.name.startsWith(currentPrefix)
          ? entry.name
          : `${currentPrefix}${entry.name}`;

        if (!objectPath.startsWith(storagePrefix)) continue;
        objectPaths.add(objectPath);

        // A normal object listing has an id and does not need a recursive
        // request. Folder entries, and object entries from older Storage
        // responses without ids, are both safe to probe as prefixes.
        if (typeof entry.id !== "string") {
          const childPrefix = objectPath.endsWith("/")
            ? objectPath
            : `${objectPath}/`;
          if (!visitedPrefixes.has(childPrefix)) {
            pendingPrefixes.push(childPrefix);
          }
        }
      }

      if (payload.length < pageSize) break;
      offset += payload.length;
    }
  }

  return [...objectPaths];
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

  const remainingPaths = await listStorageObjects(
    url,
    serviceRoleKey,
    storagePrefix,
  );
  if (remainingPaths.length > 0) {
    throw new Error("Pint-proof Storage cleanup left objects behind.");
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

async function getAccountDeletionJob(
  url: string,
  serviceRoleKey: string,
  jobId: string,
) {
  const response = await fetch(
    `${deletionJobUrl(url, jobId)}&select=id,user_id,storage_prefix,deidentified_at,storage_cleaned_at,auth_neutralized_at`,
    {
      headers: serviceHeaders(serviceRoleKey),
    },
  );
  const payload = await readJsonOrText(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload) || "Account deletion state could not be read.",
    );
  }

  if (!Array.isArray(payload)) {
    throw new Error("Account deletion state returned an invalid result.");
  }

  return (payload[0] ?? null) as AccountDeletionJob | null;
}

async function markAccountDeletionJob(
  url: string,
  serviceRoleKey: string,
  jobId: string,
  field: "storage_cleaned_at" | "auth_neutralized_at",
) {
  const response = await fetch(deletionJobUrl(url, jobId), {
    method: "PATCH",
    headers: {
      ...serviceHeaders(serviceRoleKey, true),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      [field]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  const payload = await readJsonOrText(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload) || "Account deletion state could not be updated.",
    );
  }
}

async function repairAccountDeletion(
  url: string,
  serviceRoleKey: string,
  jobId: string,
) {
  const job = await getAccountDeletionJob(url, serviceRoleKey, jobId);

  if (
    !job ||
    job.id !== jobId ||
    !isUuid(job.user_id) ||
    typeof job.storage_prefix !== "string" ||
    job.storage_prefix !== `${job.user_id}/` ||
    typeof job.deidentified_at !== "string"
  ) {
    throw new Error("Account deletion state is missing or invalid.");
  }

  await deleteStorageObjects(url, serviceRoleKey, job.storage_prefix);
  await markAccountDeletionJob(
    url,
    serviceRoleKey,
    jobId,
    "storage_cleaned_at",
  );

  await neutralizeAuthUser(url, serviceRoleKey, job.user_id);
  await markAccountDeletionJob(
    url,
    serviceRoleKey,
    jobId,
    "auth_neutralized_at",
  );
}

router.post("/account/delete/repair", async (req, res) => {
  const config = supabaseConfig();
  if (!config) {
    res.status(503).json({ message: "Account deletion is not configured." });
    return;
  }

  // This is an operational server-to-server route. It accepts only a job id
  // created by delete_my_account, never a user id or an arbitrary prefix.
  if (req.header(ACCOUNT_DELETION_REPAIR_HEADER) !== config.serviceRoleKey) {
    res.status(401).json({ message: "Account deletion repair is unauthorized." });
    return;
  }

  const body = isRecord(req.body) ? req.body : null;
  const jobId = body?.jobId;
  if (!isUuid(jobId)) {
    res.status(400).json({ message: "A valid account deletion job is required." });
    return;
  }

  try {
    await repairAccountDeletion(config.url, config.serviceRoleKey, jobId);
    res.json({ ok: true, jobId });
  } catch {
    res.status(502).json({
      message: "Account deletion repair could not be completed right now.",
    });
  }
});

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
      !isUuid(deletion.job_id) ||
      typeof deletion.storage_prefix !== "string" ||
      deletion.storage_prefix !== `${auth.userId}/`
    ) {
      throw new Error("Account deletion returned an invalid account identity.");
    }

    // The repair path reads the trusted job row created by the RPC. Once the
    // RPC succeeds, cleanup no longer depends on the user's JWT.
    await repairAccountDeletion(
      config.url,
      config.serviceRoleKey,
      deletion.job_id,
    );

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