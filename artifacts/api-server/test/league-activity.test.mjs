import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import express from "express";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheRoot = join(apiRoot, "node_modules", ".cache");
await mkdir(cacheRoot, { recursive: true });
const bundleDirectory = await mkdtemp(join(cacheRoot, "league-activity-test-"));
const routeBundlePath = join(bundleDirectory, "league-activity.mjs");
const apiClientBundlePath = join(bundleDirectory, "api-client-fetch.mjs");

await build({
  entryPoints: [resolve(apiRoot, "src/routes/league-activity.ts")],
  outfile: routeBundlePath,
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
});
await build({
  entryPoints: [resolve(apiRoot, "../../lib/api-client-react/src/custom-fetch.ts")],
  outfile: apiClientBundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
});

const { default: leagueActivityRouter } = await import(
  pathToFileURL(routeBundlePath).href
);
const { customFetch, setAuthTokenGetter, setBaseUrl } = await import(
  pathToFileURL(apiClientBundlePath).href
);

const LEAGUE_A = "40000000-0000-4000-8000-000000000001";
const LEAGUE_B = "40000000-0000-4000-8000-000000000002";
const MEMBER_ID = "10000000-0000-4000-8000-000000000001";
const NON_MEMBER_ID = "20000000-0000-4000-8000-000000000001";
const REMOVED_MEMBER_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_WAR_MEMBER_ID = "50000000-0000-4000-8000-000000000001";
const SAME_WAR_VIEWER_ID = "80000000-0000-4000-8000-000000000001";
const PINT_LOG_A_ID = "60000000-0000-4000-8000-000000000001";
const PINT_LOG_B_ID = "60000000-0000-4000-8000-000000000002";
const SCORE_EVENT_ID = "70000000-0000-4000-8000-000000000001";
const PRIVATE_PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03]);
const PRIVATE_PHOTO_PATH = `${MEMBER_ID}/${LEAGUE_A}/fixture.jpg`;
const STORAGE_OBJECT_PREFIX = "/storage/v1/object/pint-proofs/";

// These test-only values and the fetch stub ensure requests never reach Supabase.
process.env["EXPO_PUBLIC_SUPABASE_URL"] = "https://supabase.test.invalid";
process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] = "test-anon-key";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function equalsValue(filter) {
  return filter?.startsWith("eq.") ? filter.slice(3) : null;
}

function inValues(filter) {
  const match = /^in\.\((.*)\)$/.exec(filter ?? "");
  return match ? match[1].split(",") : [];
}

function matchesIdFilter(filter, id) {
  if (!filter) return true;
  const equals = equalsValue(filter);
  if (equals !== null) return equals === id;
  return inValues(filter).includes(id);
}

function makeFixture() {
  return {
    usersByToken: {
      "member-token": MEMBER_ID,
      "non-member-token": NON_MEMBER_ID,
      "removed-member-token": REMOVED_MEMBER_ID,
      "other-war-member-token": OTHER_WAR_MEMBER_ID,
      "same-war-viewer-token": SAME_WAR_VIEWER_ID,
    },
    memberships: [
      { user_id: MEMBER_ID, league_id: LEAGUE_A, status: "active" },
      { user_id: SAME_WAR_VIEWER_ID, league_id: LEAGUE_A, status: "active" },
      { user_id: REMOVED_MEMBER_ID, league_id: LEAGUE_A, status: "removed" },
      { user_id: OTHER_WAR_MEMBER_ID, league_id: LEAGUE_B, status: "active" },
    ],
    scoreEvents: [
      {
        id: SCORE_EVENT_ID,
        user_id: MEMBER_ID,
        event_type: "PINT_LOGGED",
        points: 1,
        pint_log_id: PINT_LOG_A_ID,
        created_at: "2026-09-30T12:00:00.000Z",
        league_id: LEAGUE_A,
      },
    ],
    profiles: [{ id: MEMBER_ID, display_name: "War Member" }],
    pintLogs: [
      {
        id: PINT_LOG_A_ID,
        user_id: MEMBER_ID,
        league_id: LEAGUE_A,
        photo_path: PRIVATE_PHOTO_PATH,
        pub_name: "Fixture Pub",
      },
      {
        id: PINT_LOG_B_ID,
        user_id: OTHER_WAR_MEMBER_ID,
        league_id: LEAGUE_B,
        photo_path: `${OTHER_WAR_MEMBER_ID}/${LEAGUE_B}/other-war.jpg`,
        pub_name: "Other War Pub",
      },
    ],
  };
}

let fixture = makeFixture();
let upstreamCalls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const requestUrl =
    input instanceof URL
      ? input
      : new URL(typeof input === "string" ? input : input.url);
  if (requestUrl.origin === baseUrl) {
    return originalFetch(input, init);
  }
  const headers = new Headers(init.headers);
  upstreamCalls.push({ pathname: requestUrl.pathname, search: requestUrl.search });

  if (requestUrl.pathname === "/auth/v1/user") {
    const token = /^Bearer\s+(.+)$/i.exec(headers.get("authorization") ?? "")?.[1];
    const userId = token ? fixture.usersByToken[token] : undefined;
    return userId
      ? jsonResponse({ id: userId })
      : jsonResponse({ message: "Invalid test session." }, 401);
  }

  if (requestUrl.pathname.startsWith("/rest/v1/")) {
    const table = requestUrl.pathname.slice("/rest/v1/".length);

    if (table === "league_memberships") {
      const leagueFilter = requestUrl.searchParams.get("league_id");
      const statusFilter = requestUrl.searchParams.get("status");
      assert.equal(statusFilter, "in.(active,retired)");
      const leagueId = equalsValue(leagueFilter);
      const allowedStatuses = inValues(statusFilter);
      return jsonResponse(
        fixture.memberships.filter(
          (membership) =>
            membership.league_id === leagueId &&
            allowedStatuses.includes(membership.status),
        ),
      );
    }

    if (table === "league_score_events") {
      const leagueId = equalsValue(requestUrl.searchParams.get("league_id"));
      return jsonResponse(
        fixture.scoreEvents.filter((event) => event.league_id === leagueId),
      );
    }

    if (table === "profiles") {
      const userIds = inValues(requestUrl.searchParams.get("id"));
      return jsonResponse(
        fixture.profiles.filter((profile) => userIds.includes(profile.id)),
      );
    }

    if (table === "pint_logs") {
      const leagueId = equalsValue(requestUrl.searchParams.get("league_id"));
      const idFilter = requestUrl.searchParams.get("id");
      return jsonResponse(
        fixture.pintLogs.filter(
          (pintLog) =>
            pintLog.league_id === leagueId &&
            matchesIdFilter(idFilter, pintLog.id),
        ),
      );
    }

    throw new Error(`Unexpected test query to /rest/v1/${table}.`);
  }

  if (requestUrl.pathname.startsWith(STORAGE_OBJECT_PREFIX)) {
    const requestedPath = decodeURIComponent(
      requestUrl.pathname.slice(STORAGE_OBJECT_PREFIX.length),
    );
    if (requestedPath !== PRIVATE_PHOTO_PATH) {
      return new Response("Not found.", { status: 404 });
    }
    return new Response(PRIVATE_PHOTO_BYTES, {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });
  }

  throw new Error(`Unexpected test fetch to ${requestUrl.pathname}.`);
};

const app = express();
app.use("/api", leagueActivityRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolveListening, rejectListening) => {
  server.once("listening", resolveListening);
  server.once("error", rejectListening);
});
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

function resetFixture() {
  fixture = makeFixture();
  upstreamCalls = [];
}

function request(path, token) {
  return new Promise((resolveRequest, rejectRequest) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const requestHandle = http.request(
      `${baseUrl}${path}`,
      { method: "GET", headers },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          resolveRequest({
            status: response.statusCode,
            headers: response.headers,
            body,
            text: body.toString("utf8"),
          });
        });
      },
    );
    requestHandle.on("error", rejectRequest);
    requestHandle.end();
  });
}

const activityPath = `/api/pint-proofs/leagues/${LEAGUE_A}/activity`;
const memberPhotoPath = `/api/pint-proofs/leagues/${LEAGUE_A}/photos/${PINT_LOG_A_ID}`;
const otherWarPhotoPath = `/api/pint-proofs/leagues/${LEAGUE_A}/photos/${PINT_LOG_B_ID}`;

async function assertDeniedPair(t, label, token) {
  await t.test(`${label} cannot read activity`, async () => {
    resetFixture();
    const response = await request(activityPath, token);
    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.text), {
      message: "You are not a member of this Pint War.",
    });
    assert.equal(
      upstreamCalls.filter((call) => call.pathname === "/rest/v1/league_memberships").length,
      1,
    );
    assert.equal(
      upstreamCalls.some((call) => call.pathname === "/rest/v1/league_score_events"),
      false,
    );
  });

  await t.test(`${label} cannot fetch proof photos`, async () => {
    resetFixture();
    const response = await request(otherWarPhotoPath, token);
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.text, /photo_path|signedURL|signedUrl/i);
    assert.equal(
      upstreamCalls.filter((call) => call.pathname === "/rest/v1/league_memberships").length,
      1,
    );
    assert.equal(
      upstreamCalls.some(
        (call) =>
          call.pathname === "/rest/v1/pint_logs" ||
          call.pathname.startsWith(STORAGE_OBJECT_PREFIX),
      ),
      false,
    );
  });
}

test("an authenticated member of the same Pint War can access activity and proof photos", async (t) => {
  await t.test("activity returns the member's Pint War event", async () => {
    resetFixture();
    const response = await request(activityPath, "member-token");
    assert.equal(response.status, 200);

    const payload = JSON.parse(response.text);
    assert.equal(payload.events.length, 1);
    assert.equal(payload.events[0].userId, MEMBER_ID);
    assert.equal(payload.events[0].photoPintLogId, PINT_LOG_A_ID);
    assert.equal(payload.events[0].pubName, "Fixture Pub");
    assert.equal(response.text.includes(PRIVATE_PHOTO_PATH), false);
    assert.equal(response.text.includes("storage/v1/object"), false);
  });

  await t.test("a same-war member can read the private proof image", async () => {
    resetFixture();
    const response = await request(memberPhotoPath, "member-token");
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "image/jpeg");
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.equal(response.headers.vary, "Authorization");
    assert.deepEqual(response.body, PRIVATE_PHOTO_BYTES);
    assert.equal(
      upstreamCalls.some((call) => call.pathname.startsWith(STORAGE_OBJECT_PREFIX)),
      true,
    );
  });

  await t.test("a different same-war member can read another member's private proof image", async () => {
    resetFixture();
    setBaseUrl(baseUrl);
    setAuthTokenGetter(() => "same-war-viewer-token");
    try {
      const photo = await customFetch(
        `/api/pint-proofs/leagues/${LEAGUE_A}/photos/${PINT_LOG_A_ID}`,
      );
      assert.ok(photo instanceof Blob);
      assert.equal(photo.type, "image/jpeg");
      assert.deepEqual(Buffer.from(await photo.arrayBuffer()), PRIVATE_PHOTO_BYTES);
      assert.equal(
        upstreamCalls.some((call) => call.pathname.startsWith(STORAGE_OBJECT_PREFIX)),
        true,
      );
    } finally {
      setAuthTokenGetter(null);
      setBaseUrl(null);
    }
  });
});

test("an authenticated non-member cannot access another Pint War", async (t) => {
  await assertDeniedPair(t, "a non-member", "non-member-token");
});

test("a previously removed member cannot access their former Pint War", async (t) => {
  await assertDeniedPair(t, "a removed member", "removed-member-token");
});

test("a member of a different Pint War cannot access this Pint War", async (t) => {
  await assertDeniedPair(t, "a different-war member", "other-war-member-token");
});

test("unauthenticated users receive 401 for activity and proof-photo requests", async (t) => {
  await t.test("activity requires authentication", async () => {
    resetFixture();
    const response = await request(activityPath);
    assert.equal(response.status, 401);
    assert.deepEqual(JSON.parse(response.text), { message: "You must be signed in." });
    assert.equal(upstreamCalls.length, 0);
  });

  await t.test("proof photos require authentication", async () => {
    resetFixture();
    const response = await request(memberPhotoPath);
    assert.equal(response.status, 401);
    assert.deepEqual(JSON.parse(response.text), { message: "You must be signed in." });
    assert.equal(upstreamCalls.length, 0);
  });
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  await rm(bundleDirectory, { recursive: true, force: true });
});