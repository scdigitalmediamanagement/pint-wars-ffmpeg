type SupabaseUserResponse = {
  id?: unknown;
};

export type SupabaseAuthResult =
  | { authenticated: true; userId: string }
  | { authenticated: false; status: 401 | 503; message: string };

function bearerToken(authorization: string | undefined) {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

export async function authenticateSupabaseBearer(
  authorization: string | undefined,
): Promise<SupabaseAuthResult> {
  const token = bearerToken(authorization);
  if (!token) {
    return {
      authenticated: false,
      status: 401,
      message: "You must be signed in.",
    };
  }

  const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const supabaseAnonKey = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"];
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      authenticated: false,
      status: 503,
      message: "Authentication is not configured.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return {
      authenticated: false,
      status: 503,
      message: "Authentication is temporarily unavailable.",
    };
  }

  if (!response.ok) {
    return {
      authenticated: false,
      status: 401,
      message: "Your session is invalid or has expired.",
    };
  }

  let user: SupabaseUserResponse;
  try {
    user = (await response.json()) as SupabaseUserResponse;
  } catch {
    return {
      authenticated: false,
      status: 503,
      message: "Authentication is temporarily unavailable.",
    };
  }
  if (typeof user.id !== "string" || !user.id) {
    return {
      authenticated: false,
      status: 401,
      message: "Your session is invalid or has expired.",
    };
  }

  return { authenticated: true, userId: user.id };
}