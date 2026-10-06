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
const bundleDirectory = await mkdtemp(join(cacheRoot, "google-places-test-"));
const routeBundlePath = join(bundleDirectory, "pubs-route.mjs");
const apiZodEntryPoint = resolve(apiRoot, "../../lib/api-zod/src/index.ts");

await build({
  entryPoints: [resolve(apiRoot, "src/routes/pubs.ts")],
  outfile: routeBundlePath,
  bundle: true,
  external: ["express"],
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "test-api-zod-source",
      setup(buildApi) {
        buildApi.onResolve(
          { filter: /^@workspace\/api-zod$/ },
          () => ({ path: apiZodEntryPoint }),
        );
      },
    },
  ],
});

process.env["EXPO_PUBLIC_SUPABASE_URL"] = "https://supabase.test.invalid";
process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] = "test-anon-key";
process.env["GOOGLE_PLACES_API_KEY"] = "test-google-places-key";

const { default: pubsRouter } = await import(
  pathToFileURL(routeBundlePath).href
);
const app = express();
app.use(express.json());
app.use("/api", pubsRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolveListening, rejectListening) => {
  server.once("listening", resolveListening);
  server.once("error", rejectListening);
});
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

const originalFetch = globalThis.fetch;
const validToken = "valid-test-session";
const placeId = "Test_Pub-1";
const photoName = `places/${placeId}/photos/Test_Photo-2`;
const googleCalls = [];
let nearbyPlaces = [];
let photoMediaResponse = {
  photoUri: "https://lh3.googleusercontent.com/test-photo",
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toUrl(input) {
  if (input instanceof URL) return input;
  if (input instanceof Request) return new URL(input.url);
  return new URL(String(input));
}

globalThis.fetch = async (input, init = {}) => {
  const url = toUrl(input);
  if (url.origin === baseUrl) return originalFetch(input, init);

  const headers = new Headers(init.headers);
  if (url.pathname === "/auth/v1/user") {
    return headers.get("authorization") === `Bearer ${validToken}`
      ? jsonResponse({ id: "test-user-id" })
      : jsonResponse({ message: "Invalid test session." }, 401);
  }

  if (
    url.origin === "https://places.googleapis.com" &&
    url.pathname === "/v1/places:searchNearby"
  ) {
    googleCalls.push({ type: "nearby", url, headers, init });
    return jsonResponse({ places: nearbyPlaces });
  }

  if (
    url.origin === "https://places.googleapis.com" &&
    url.pathname.endsWith("/media")
  ) {
    googleCalls.push({ type: "photo", url, headers, init });
    return jsonResponse(photoMediaResponse);
  }

  throw new Error(`Unexpected upstream request: ${url.origin}${url.pathname}`);
};

function request(path, { token, method = "GET", body } = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const requestHandle = http.request(
      `${baseUrl}${path}`,
      { method, headers },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolveRequest({
            status: response.statusCode,
            headers: response.headers,
            text,
            json: () => JSON.parse(text),
          });
        });
      },
    );
    requestHandle.on("error", rejectRequest);
    if (body) requestHandle.write(JSON.stringify(body));
    requestHandle.end();
  });
}

const photoUriPath = `/api/pubs/nearby/photo-uri?photoName=${encodeURIComponent(photoName)}`;

test("nearby search returns authentic photo credits and a Google Maps link", async () => {
  googleCalls.length = 0;
  nearbyPlaces = [
    {
      id: placeId,
      displayName: { text: "Test Pub" },
      formattedAddress: "1 Test Street",
      location: { latitude: 51.5, longitude: -0.12 },
      googleMapsUri: "https://maps.google.com/?cid=12345",
      photos: [
        {
          name: photoName,
          authorAttributions: [
            {
              displayName: "First Contributor",
              uri: "//maps.google.com/maps/contrib/100",
              photoUri: "//lh3.googleusercontent.com/author-100",
            },
            {
              displayName: "Second Contributor",
              uri: "https://maps.google.com/maps/contrib/200",
            },
          ],
        },
        {
          name: `places/${placeId}/photos/Unselected_Photo`,
          authorAttributions: [{ displayName: "Unselected Contributor" }],
        },
      ],
    },
  ];

  const response = await request("/api/pubs/nearby", {
    token: validToken,
    method: "POST",
    body: { latitude: 51.5, longitude: -0.12 },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(response.headers.vary, "Authorization");
  const result = response.json();
  assert.equal(result.pubs[0].name, "Test Pub");
  assert.equal(result.pubs[0].googleMapsUri, "https://maps.google.com/?cid=12345");
  assert.deepEqual(result.pubs[0].photos, [
    {
      name: photoName,
      authorAttributions: [
        {
          displayName: "First Contributor",
          uri: "https://maps.google.com/maps/contrib/100",
          photoUri: "https://lh3.googleusercontent.com/author-100",
        },
        {
          displayName: "Second Contributor",
          uri: "https://maps.google.com/maps/contrib/200",
        },
      ],
    },
  ]);
  assert.equal(
    new Headers(googleCalls[0].init.headers).get("X-Goog-FieldMask"),
    "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.photos.name,places.photos.authorAttributions",
  );
  assert.equal(
    new Headers(googleCalls[0].init.headers).get("X-Goog-Api-Key"),
    "test-google-places-key",
  );
  assert.equal(response.text.includes("test-google-places-key"), false);
});

test("places without a valid photo keep the honest no-photo fallback", async () => {
  googleCalls.length = 0;
  nearbyPlaces = [
    {
      id: placeId,
      displayName: { text: "No-photo Pub" },
      formattedAddress: "2 Test Street",
      location: { latitude: 51.5, longitude: -0.12 },
      photos: [{ name: "not-a-google-photo-resource" }],
    },
  ];

  const response = await request("/api/pubs/nearby", {
    token: validToken,
    method: "POST",
    body: { latitude: 51.5, longitude: -0.12 },
  });

  assert.equal(response.status, 200);
  assert.equal("photos" in response.json().pubs[0], false);
  assert.equal(googleCalls.filter((call) => call.type === "photo").length, 0);
});

test("authenticated photo URI requests use Google's non-redirect endpoint without caching", async () => {
  googleCalls.length = 0;
  photoMediaResponse = {
    photoUri: "https://lh3.googleusercontent.com/fresh-test-photo",
  };

  const response = await request(photoUriPath, { token: validToken });

  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(response.headers.pragma, "no-cache");
  assert.equal(response.headers.vary, "Authorization");
  assert.deepEqual(response.json(), {
    photoUri: "https://lh3.googleusercontent.com/fresh-test-photo",
  });
  const upstream = googleCalls.find((call) => call.type === "photo");
  assert.ok(upstream);
  assert.equal(
    upstream.url.pathname,
    `/v1/${photoName}/media`,
  );
  assert.equal(upstream.url.searchParams.get("maxWidthPx"), "512");
  assert.equal(upstream.url.searchParams.get("skipHttpRedirect"), "true");
  assert.equal(upstream.init.cache, "no-store");
  assert.equal(upstream.headers.get("X-Goog-Api-Key"), "test-google-places-key");
  assert.equal(response.text.includes("test-google-places-key"), false);
});

test("photo URI requests require authentication and reject malformed resources", async () => {
  googleCalls.length = 0;
  const unauthorized = await request(photoUriPath);
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(googleCalls.filter((call) => call.type === "photo").length, 0);

  const invalid = await request(
    "/api/pubs/nearby/photo-uri?photoName=other%2Fusers%2Fphoto",
    { token: validToken },
  );
  assert.equal(invalid.status, 400);
  assert.equal(googleCalls.filter((call) => call.type === "photo").length, 0);
});

test("an unexpected image host from Google is not returned to the app", async () => {
  googleCalls.length = 0;
  photoMediaResponse = { photoUri: "https://untrusted.example/photo.jpg" };

  const response = await request(photoUriPath, { token: validToken });

  assert.equal(response.status, 502);
  assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(response.text.includes("untrusted.example"), false);
  assert.equal(response.text.includes("test-google-places-key"), false);
});

after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  await rm(bundleDirectory, { recursive: true, force: true });
});
