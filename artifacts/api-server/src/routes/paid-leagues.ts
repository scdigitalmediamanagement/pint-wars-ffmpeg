import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { authenticateSupabaseBearer } from "../lib/supabase-auth";

const router: IRouter = Router();

const PRODUCT_CAPACITY: Record<string, number> = {
  pint_war_6_players: 6,
  pint_war_10_players: 10,
  pint_war_14_players: 14,
  pint_war_16_players: 16,
};

type RevenueCatEvent = {
  type?: unknown;
  app_user_id?: unknown;
  product_id?: unknown;
  transaction_id?: unknown;
  store?: unknown;
  purchased_at_ms?: unknown;
};

type SupabaseErrorPayload = {
  message?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

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

function userRpcHeaders(serviceRoleKey: string, authorization: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: authorization,
    "content-type": "application/json",
  };
}

function errorMessage(payload: unknown) {
  if (!isRecord(payload)) return "";
  return typeof (payload as SupabaseErrorPayload).message === "string"
    ? (payload as SupabaseErrorPayload).message as string
    : "";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function matchesWebhookAuthorization(
  provided: string | undefined,
  secret: string,
) {
  if (!provided) return false;
  const expectedBytes = Buffer.from(`Bearer ${secret}`);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

function revenueCatProvider(store: unknown) {
  if (typeof store !== "string") return null;
  const stores: Record<string, string> = {
    APP_STORE: "app_store",
    PLAY_STORE: "play_store",
    TEST_STORE: "test_store",
  };
  return stores[store.toUpperCase()] ?? null;
}

router.get("/paid-leagues/availability", async (req, res) => {
  const auth = await authenticateSupabaseBearer(req.header("authorization"));
  if (!auth.authenticated) {
    res.status(auth.status).json({ message: auth.message });
    return;
  }

  const config = supabaseConfig();
  if (!config || !process.env["REVENUECAT_WEBHOOK_AUTHORIZATION"]) {
    res.json({ ready: false });
    return;
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/paid_league_purchases?select=id&limit=0`,
      { headers: serviceHeaders(config.serviceRoleKey) },
    );
    res.json({ ready: response.ok });
  } catch {
    res.json({ ready: false });
  }
});

router.post("/revenuecat/webhook", async (req, res) => {
  const webhookSecret = process.env["REVENUECAT_WEBHOOK_AUTHORIZATION"];
  if (!webhookSecret) {
    res.status(503).json({ message: "Purchase verification is not configured." });
    return;
  }

  if (!matchesWebhookAuthorization(req.header("authorization"), webhookSecret)) {
    res.status(401).json({ message: "Invalid webhook authorization." });
    return;
  }

  if (!isRecord(req.body) || !isRecord(req.body.event)) {
    res.status(400).json({ message: "The RevenueCat event is invalid." });
    return;
  }

  const event = req.body.event as RevenueCatEvent;
  if (event.type === "TEST") {
    res.json({ received: true });
    return;
  }

  if (event.type !== "NON_RENEWING_PURCHASE") {
    res.json({ received: true, ignored: true });
    return;
  }

  const capacity =
    typeof event.product_id === "string"
      ? PRODUCT_CAPACITY[event.product_id]
      : undefined;
  const provider = revenueCatProvider(event.store);
  const purchasedAtMilliseconds = Number(event.purchased_at_ms);

  if (
    !isUuid(event.app_user_id) ||
    typeof event.product_id !== "string" ||
    capacity === undefined ||
    typeof event.transaction_id !== "string" ||
    event.transaction_id.trim().length < 1 ||
    event.transaction_id.trim().length > 255 ||
    !provider ||
    !Number.isSafeInteger(purchasedAtMilliseconds) ||
    purchasedAtMilliseconds <= 0
  ) {
    // Acknowledge unrelated or malformed non-renewing products instead of
    // retrying an event that cannot safely be fulfilled.
    res.json({ received: true, ignored: true });
    return;
  }

  const config = supabaseConfig();
  if (!config) {
    res.status(503).json({ message: "Purchase verification is not configured." });
    return;
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/rpc/record_verified_paid_league_purchase`,
      {
        method: "POST",
        headers: serviceHeaders(config.serviceRoleKey, true),
        body: JSON.stringify({
          p_user_id: event.app_user_id,
          p_provider: provider,
          p_provider_purchase_id: event.transaction_id.trim(),
          p_provider_product_id: event.product_id,
          p_capacity: capacity,
          p_purchased_at: new Date(purchasedAtMilliseconds).toISOString(),
        }),
      },
    );

    if (!response.ok) {
      await readJson(response);
      res.status(503).json({ message: "The verified purchase could not be recorded." });
      return;
    }

    res.json({ received: true });
  } catch {
    res.status(503).json({ message: "Purchase verification is temporarily unavailable." });
  }
});

router.post("/paid-leagues/create", async (req, res) => {
  const authorization = req.header("authorization");
  const auth = await authenticateSupabaseBearer(authorization);
  if (!auth.authenticated) {
    res.status(auth.status).json({ message: auth.message });
    return;
  }

  if (!isRecord(req.body)) {
    res.status(400).json({ message: "League details are invalid." });
    return;
  }

  const name =
    typeof req.body.name === "string" ? req.body.name.trim() : "";
  const productIdentifier =
    typeof req.body.productIdentifier === "string"
      ? req.body.productIdentifier
      : "";
  const transactionIdentifier =
    typeof req.body.transactionIdentifier === "string"
      ? req.body.transactionIdentifier.trim()
      : "";
  const durationDays =
    typeof req.body.durationDays === "number" ? req.body.durationDays : NaN;

  if (name.length < 1 || name.length > 80) {
    res.status(400).json({ message: "League name must be between 1 and 80 characters." });
    return;
  }

  if (!Object.hasOwn(PRODUCT_CAPACITY, productIdentifier)) {
    res.status(400).json({ message: "The selected league product is not supported." });
    return;
  }

  if (transactionIdentifier.length < 1 || transactionIdentifier.length > 255) {
    res.status(400).json({ message: "The purchase transaction is invalid." });
    return;
  }

  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) {
    res.status(400).json({ message: "Duration must be between 1 and 30 days." });
    return;
  }

  const config = supabaseConfig();
  if (!config || !process.env["REVENUECAT_WEBHOOK_AUTHORIZATION"]) {
    res.status(503).json({ message: "Paid Pint Wars are not ready yet." });
    return;
  }

  try {
    const purchaseUrl = new URL(
      `${config.url}/rest/v1/paid_league_purchases`,
    );
    purchaseUrl.searchParams.set("select", "id");
    purchaseUrl.searchParams.set("user_id", `eq.${auth.userId}`);
    purchaseUrl.searchParams.set(
      "provider_purchase_id",
      `eq.${transactionIdentifier}`,
    );
    purchaseUrl.searchParams.set(
      "provider_product_id",
      `eq.${productIdentifier}`,
    );
    purchaseUrl.searchParams.set("limit", "2");

    const purchaseResponse = await fetch(purchaseUrl, {
      headers: serviceHeaders(config.serviceRoleKey),
    });
    if (!purchaseResponse.ok) {
      res.status(503).json({ message: "Purchase verification is temporarily unavailable." });
      return;
    }

    const purchases = await readJson(purchaseResponse);
    if (!Array.isArray(purchases)) {
      res.status(503).json({ message: "Purchase verification is temporarily unavailable." });
      return;
    }

    if (purchases.length === 0) {
      res.status(202).json({
        pending: true,
        message: "RevenueCat is still verifying your purchase.",
      });
      return;
    }

    if (purchases.length > 1) {
      res.status(409).json({
        message: "This purchase could not be matched uniquely. Please contact support before trying again.",
      });
      return;
    }

    const purchaseId =
      isRecord(purchases[0]) && typeof purchases[0].id === "string"
        ? purchases[0].id
        : null;
    if (!purchaseId) {
      res.status(503).json({ message: "Purchase verification is temporarily unavailable." });
      return;
    }

    const createResponse = await fetch(
      `${config.url}/rest/v1/rpc/create_paid_league`,
      {
        method: "POST",
        headers: userRpcHeaders(
          config.serviceRoleKey,
          authorization as string,
        ),
        body: JSON.stringify({
          p_name: name,
          p_purchase_id: purchaseId,
          p_duration_days: durationDays,
        }),
      },
    );

    const result = await readJson(createResponse);
    if (!createResponse.ok) {
      res.status(409).json({
        message:
          errorMessage(result) ||
          "This verified purchase could not be used. Please try again.",
      });
      return;
    }

    const league = Array.isArray(result) ? result[0] : result;
    if (
      !isRecord(league) ||
      typeof league.league_id !== "string" ||
      typeof league.invite_code !== "string"
    ) {
      res.status(502).json({ message: "League creation returned an invalid result." });
      return;
    }

    res.json({
      league_id: league.league_id,
      invite_code: league.invite_code,
    });
  } catch {
    res.status(503).json({ message: "Paid league creation is temporarily unavailable." });
  }
});

export default router;