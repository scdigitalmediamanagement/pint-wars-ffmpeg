import { fetch as expoFetch } from 'expo/fetch';
import { getSupabase } from '@/src/lib/supabase';
import type { LeagueDashboard, LeagueMembership, LeagueSummary, MyLeague } from '@/src/types/league';
import type { NearbyPub } from '@/src/lib/pub-service';

type LeagueRow = MyLeague['league'];
const PINT_PROOF_BUCKET = 'pint-proofs';

export type NotificationType = 'player_joined' | 'pint_logged' | 'war_ending_soon' | 'war_finished' | 'winner';

export type AppNotification = {
  id: string;
  notification_type: NotificationType;
  title: string;
  body: string;
  league_id: string | null;
  read_at: string | null;
  created_at: string;
};

function describeSupabaseError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { code: null, message: String(error), details: null, hint: null };
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  return {
    code: typeof candidate.code === 'string' ? candidate.code : null,
    message: typeof candidate.message === 'string' ? candidate.message : String(error),
    details: typeof candidate.details === 'string' ? candidate.details : null,
    hint: typeof candidate.hint === 'string' ? candidate.hint : null,
  };
}

async function paidLeagueRequest(
  path: string,
  body?: Record<string, string | number>,
) {
  const client = getSupabase();
  const [{ data: sessionData, error: sessionError }] = await Promise.all([
    client.auth.getSession(),
  ]);
  if (sessionError) throw sessionError;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sign in before creating a paid Pint War.');

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) throw new Error('The Pint Wars API is not configured.');

  return expoFetch(`https://${domain}/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function readApiPayload(response: Response) {
  try {
    return (await response.json()) as {
      ready?: unknown;
      pending?: unknown;
      message?: unknown;
      league_id?: unknown;
      invite_code?: unknown;
    };
  } catch {
    return null;
  }
}

export async function checkPaidLeaguePurchaseAvailability() {
  const response = await paidLeagueRequest('paid-leagues/availability');
  const payload = await readApiPayload(response);
  if (!response.ok || typeof payload?.ready !== 'boolean') {
    throw new Error(
      typeof payload?.message === 'string'
        ? payload.message
        : 'Paid Pint Wars could not be checked.',
    );
  }
  return payload.ready;
}

export async function createPaidLeague(
  name: string,
  productIdentifier: string,
  selectedProductIdentifier: string,
  transactionIdentifier: string,
  durationDays: number,
) {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 80) {
    throw new Error('League name must be between 1 and 80 characters.');
  }

  if (productIdentifier !== selectedProductIdentifier) {
    throw new Error(
      'The purchased product does not match the selected Pint War size. No league was created.',
    );
  }

  const trimmedTransactionIdentifier = transactionIdentifier.trim();
  if (
    trimmedTransactionIdentifier.length < 1 ||
    trimmedTransactionIdentifier.length > 255
  ) {
    throw new Error(
      'This purchase is missing its transaction ID. Do not purchase again; contact support.',
    );
  }

  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) {
    throw new Error('Duration must be between 1 and 30 days.');
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await paidLeagueRequest('paid-leagues/create', {
      name: trimmedName,
      productIdentifier,
      selectedProductIdentifier,
      transactionIdentifier: trimmedTransactionIdentifier,
      durationDays,
    });
    const payload = await readApiPayload(response);

    if (response.status === 202 && payload?.pending === true) {
      if (attempt < 9) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      throw new Error(
        'Payment succeeded, but verification is still processing. Retry league creation in a moment.',
      );
    }

    if (!response.ok) {
      throw new Error(
        typeof payload?.message === 'string'
          ? payload.message
          : 'Your paid Pint War could not be created.',
      );
    }

    if (
      typeof payload?.league_id !== 'string' ||
      typeof payload.invite_code !== 'string'
    ) {
      throw new Error('League creation returned an invalid result.');
    }

    return {
      league_id: payload.league_id,
      invite_code: payload.invite_code,
    };
  }

  throw new Error(
    'Payment succeeded, but verification is still processing. Retry league creation in a moment.',
  );
}

export async function getMyLeagues(): Promise<MyLeague[]> {
  const client = getSupabase();
  const { error: refreshError } = await client.rpc('refresh_my_league_statuses', {});
  if (refreshError) throw refreshError;
  const { data, error } = await client
    .from('league_memberships')
    .select('id, role, status, league:leagues(*)')
    .order('joined_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    role: MyLeague['role'];
    status: MyLeague['membershipStatus'];
    league: LeagueRow | LeagueRow[] | null;
  }>)
    .filter((item) => item.league)
    .map((item) => ({
      membershipId: item.id,
      role: item.role,
      membershipStatus: item.status,
      league: Array.isArray(item.league) ? item.league[0] : item.league,
    }))
    .filter((item): item is MyLeague => Boolean(item.league));
}

export async function createFreeLeague(name: string) {
  const client = getSupabase();
  const trimmedName = name.trim();

  if (__DEV__) {
    const { data: userData, error: userError } = await client.auth.getUser();
    let profileExists: boolean | null = null;
    let profileError: ReturnType<typeof describeSupabaseError> | null = null;

    if (userData.user) {
      const { data: profile, error: lookupError } = await client
        .from('profiles')
        .select('id')
        .eq('id', userData.user.id)
        .maybeSingle();
      profileExists = Boolean(profile);
      profileError = lookupError ? describeSupabaseError(lookupError) : null;
    }

    console.log('[Pint Wars] create_free_league preflight', {
      userId: userData.user?.id ?? null,
      authError: userError ? describeSupabaseError(userError) : null,
      profileExists,
      profileError,
      nameLength: trimmedName.length,
    });
  }

  const { data, error } = await client.rpc('create_free_league', {
    p_name: trimmedName,
  });
  if (error) {
    if (__DEV__) {
      console.error('[Pint Wars] create_free_league failed', describeSupabaseError(error));
    }
    throw error;
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('The league could not be created.');
  if (__DEV__) {
    console.log('[Pint Wars] create_free_league succeeded', {
      leagueId: result.league_id,
      hasInviteCode: Boolean(result.invite_code),
    });
  }
  return result as { league_id: string; invite_code: string };
}

export async function joinLeagueByCode(code: string) {
  const client = getSupabase();
  const normalizedCode = code.trim().toUpperCase();

  if (__DEV__) {
    const { data: userData, error: userError } = await client.auth.getUser();
    console.log('[Pint Wars] join_league_by_code preflight', {
      userId: userData.user?.id ?? null,
      authError: userError ? describeSupabaseError(userError) : null,
      codeLength: normalizedCode.length,
    });
  }

  const { data, error } = await client.rpc('join_league_by_code', {
    p_code: normalizedCode,
  });
  if (error) {
    if (__DEV__) {
      console.error('[Pint Wars] join_league_by_code failed', describeSupabaseError(error));
    }
    throw error;
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('The invite could not be accepted.');
  if (__DEV__) {
    console.log('[Pint Wars] join_league_by_code succeeded', {
      leagueId: result.league_id,
    });
  }
  return result as { league_id: string };
}

export async function createLeagueInvite(leagueId: string) {
  const { data, error } = await getSupabase().rpc('create_league_invite', {
    p_league_id: leagueId,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('The invite could not be created.');
  return result as { invite_code: string };
}

export async function retireFromLeague(leagueId: string) {
  const { error } = await getSupabase().rpc('retire_from_league', {
    p_league_id: leagueId,
  });
  if (error) {
    if (__DEV__) {
      console.error('[Pint Wars] retire_from_league failed', describeSupabaseError(error));
    }
    throw new Error('Could not retire from this Pint War. Please try again.');
  }
}

export async function endLeagueEarly(leagueId: string) {
  const { error } = await getSupabase().rpc('end_league_early', {
    p_league_id: leagueId,
  });
  if (error) {
    if (__DEV__) {
      console.error('[Pint Wars] end_league_early failed', describeSupabaseError(error));
    }
    throw new Error('Could not end this Pint War. Please try again.');
  }
}

export async function getMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await getSupabase().rpc('get_my_notifications', { p_limit: 50 });
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data, error } = await getSupabase().rpc('get_my_unread_notification_count');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await getSupabase().rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function getLeagueDashboard(leagueId: string): Promise<LeagueDashboard> {
  const client = getSupabase();
  const { error: refreshError } = await client.rpc('complete_expired_league', {
    p_league_id: leagueId,
  });
  if (refreshError) throw refreshError;
  const [
    { data: league, error: leagueError },
    { data: members, error: memberError },
    { data: pintTotals, error: pintTotalsError },
  ] =
    await Promise.all([
      client.from('leagues').select('*').eq('id', leagueId).single(),
      client
        .from('league_memberships')
        .select('id, league_id, user_id, role, status, joined_at, retired_at, removed_at, profile:profiles(display_name)')
        .eq('league_id', leagueId)
        .neq('status', 'removed')
        .order('joined_at', { ascending: true }),
      client.rpc('get_league_pint_totals', { p_league_id: leagueId }),
    ]);

  if (leagueError) throw leagueError;
  if (memberError) throw memberError;
  if (pintTotalsError) throw pintTotalsError;

  const totalsByUser = new Map(
    (pintTotals ?? []).map((total) => [total.user_id, Number(total.pint_total)]),
  );

  const normalizedMembers = ((members ?? []) as unknown as Array<
    Omit<LeagueMembership, 'display_name' | 'points'> & {
      profile: { display_name: string } | { display_name: string }[] | null;
    }
  >).map((member) => {
    const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
    return {
      ...member,
      display_name: profile?.display_name || 'Player',
      points: totalsByUser.get(member.user_id) ?? 0,
    };
  });

  return {
    league: league as LeagueDashboard['league'],
    members: normalizedMembers,
  };
}

export async function getLeagueSummary(leagueId: string): Promise<LeagueSummary> {
  const { data, error } = await getSupabase().rpc('get_league_summary', {
    p_league_id: leagueId,
  });
  if (error) {
    if (__DEV__) {
      console.error('[Pint Wars] get_league_summary failed', describeSupabaseError(error));
    }
    throw new Error('Could not load the completed War Summary. Please try again.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The completed War Summary could not be loaded.');
  }
  return data as unknown as LeagueSummary;
}

type LogPintInput = {
  leagueId: string;
  userId: string;
  photoUri: string;
  mimeType: string | null;
  latitude: number | null;
  longitude: number | null;
  pub: NearbyPub | null;
};

export type LoggedPintResult = {
  pintLogId: string;
  loggedAt: string;
};

function photoExtension(mimeType: string | null) {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

export class PintPhotoUploadError extends Error {
  constructor() {
    super('Pint proof photo upload failed.');
    this.name = 'PintPhotoUploadError';
  }
}

export async function logPint({
  leagueId,
  userId,
  photoUri,
  mimeType,
  latitude,
  longitude,
  pub,
}: LogPintInput) {
  const client = getSupabase();
  const extension = photoExtension(mimeType);
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const photoPath = `${userId}/${leagueId}/${uniquePart}.${extension}`;
  let photoBytes: ArrayBuffer;
  try {
    const photoResponse = await expoFetch(photoUri);
    if (!photoResponse.ok) throw new Error('Photo could not be read.');
    photoBytes = await photoResponse.arrayBuffer();
  } catch {
    throw new PintPhotoUploadError();
  }

  try {
    const { error: uploadError } = await client.storage
      .from(PINT_PROOF_BUCKET)
      .upload(photoPath, photoBytes, {
        contentType: mimeType ?? 'image/jpeg',
        upsert: false,
      });
    if (uploadError) throw uploadError;
  } catch {
    throw new PintPhotoUploadError();
  }

  let shouldCleanup = true;
  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData.session?.access_token;
    const apiDomain = process.env.EXPO_PUBLIC_DOMAIN;

    if (!accessToken || !apiDomain) {
      throw new Error('Pint proof logging is not configured.');
    }

    const response = await expoFetch(`https://${apiDomain}/api/pint-proofs/log`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leagueId,
        photoPath,
        latitude,
        longitude,
        pub: pub
          ? {
              provider: pub.provider,
              placeId: pub.placeId,
              name: pub.name,
              address: pub.address,
              latitude: pub.coordinates.latitude,
              longitude: pub.coordinates.longitude,
            }
          : null,
      }),
    });

    const responseText = await response.text();
    let responseBody: unknown = null;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      if (
        responseBody
        && typeof responseBody === 'object'
        && 'code' in responseBody
        && responseBody.code === 'DUPLICATE_PROOF'
      ) {
        shouldCleanup = false;
      }
      throw new Error(
        responseBody
        && typeof responseBody === 'object'
        && 'message' in responseBody
        && typeof responseBody.message === 'string'
          ? responseBody.message
          : 'The pint could not be logged.',
      );
    }

    const result = Array.isArray(responseBody) ? responseBody[0] : responseBody;
    if (
      !result
      || typeof result !== 'object'
      || !('pint_id' in result)
      || typeof result.pint_id !== 'string'
      || !('logged_at' in result)
      || typeof result.logged_at !== 'string'
    ) {
      throw new Error('The pint could not be logged.');
    }

    shouldCleanup = false;
    return {
      pintLogId: result.pint_id,
      loggedAt: result.logged_at,
    } satisfies LoggedPintResult;
  } finally {
    if (shouldCleanup) {
      await client.storage.from(PINT_PROOF_BUCKET).remove([photoPath]);
    }
  }
}

export type PubPassportEntry = {
  location_key: string;
  pub_provider: string | null;
  pub_place_id: string | null;
  pub_name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  pint_count: number;
  most_recent_visit: string;
  review_count: number;
  average_atmosphere: number | null;
  average_pints_drinks: number | null;
  average_staff: number | null;
  average_music: number | null;
  average_food: number | null;
  average_value: number | null;
  current_user_review_id: string | null;
};

export async function getMyPubPassport(): Promise<PubPassportEntry[]> {
  const { data, error } = await getSupabase().rpc('get_my_pub_passport');
  if (error) throw error;
  return (data ?? []) as PubPassportEntry[];
}

export async function getMyProfile(userId: string) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, display_name, avatar_url, free_trial_used_at, created_at, updated_at')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(userId: string, displayName: string) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .update({ display_name: displayName.trim(), updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, display_name, avatar_url, free_trial_used_at, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}