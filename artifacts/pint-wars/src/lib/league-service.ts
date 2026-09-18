import { fetch as expoFetch } from 'expo/fetch';
import { getSupabase } from '@/src/lib/supabase';
import type { LeagueDashboard, LeagueMembership, MyLeague } from '@/src/types/league';
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
    Omit<LeagueMembership, 'display_name' | 'pint_total'> & {
      profile: { display_name: string } | { display_name: string }[] | null;
    }
  >).map((member) => {
    const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
    return {
      ...member,
      display_name: profile?.display_name || 'Player',
      pint_total: totalsByUser.get(member.user_id) ?? 0,
    };
  });

  return {
    league: league as LeagueDashboard['league'],
    members: normalizedMembers,
  };
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
  const photoResponse = await expoFetch(photoUri);

  if (!photoResponse.ok) {
    throw new Error('The pint photo could not be prepared for upload.');
  }

  const photoBytes = await photoResponse.arrayBuffer();
  const { error: uploadError } = await client.storage
    .from(PINT_PROOF_BUCKET)
    .upload(photoPath, photoBytes, {
      contentType: mimeType ?? 'image/jpeg',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error } = await client.rpc('log_pint', {
    p_league_id: leagueId,
    p_photo_path: photoPath,
    p_latitude: latitude,
    p_longitude: longitude,
    p_pub_provider: pub?.provider ?? null,
    p_pub_place_id: pub?.placeId ?? null,
    p_pub_name: pub?.name ?? null,
    p_pub_address: pub?.address ?? null,
    p_pub_latitude: pub?.coordinates.latitude ?? null,
    p_pub_longitude: pub?.coordinates.longitude ?? null,
  });

  if (error) {
    await client.storage.from(PINT_PROOF_BUCKET).remove([photoPath]);
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) {
    await client.storage.from(PINT_PROOF_BUCKET).remove([photoPath]);
    throw new Error('The pint could not be logged.');
  }

  return result;
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