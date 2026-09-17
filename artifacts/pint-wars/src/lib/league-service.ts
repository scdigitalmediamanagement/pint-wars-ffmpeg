import { getSupabase } from '@/src/lib/supabase';
import type { LeagueDashboard, LeagueMembership, MyLeague } from '@/src/types/league';

type LeagueRow = MyLeague['league'];

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
  const { data, error } = await getSupabase().rpc('join_league_by_code', {
    p_code: code.trim().toUpperCase(),
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('The invite could not be accepted.');
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

export async function getLeagueDashboard(leagueId: string): Promise<LeagueDashboard> {
  const client = getSupabase();
  const { error: refreshError } = await client.rpc('complete_expired_league', {
    p_league_id: leagueId,
  });
  if (refreshError) throw refreshError;
  const [{ data: league, error: leagueError }, { data: members, error: memberError }] =
    await Promise.all([
      client.from('leagues').select('*').eq('id', leagueId).single(),
      client
        .from('league_memberships')
        .select('id, league_id, user_id, role, status, joined_at, retired_at, removed_at, profile:profiles(display_name)')
        .eq('league_id', leagueId)
        .order('joined_at', { ascending: true }),
    ]);

  if (leagueError) throw leagueError;
  if (memberError) throw memberError;

  const normalizedMembers = ((members ?? []) as unknown as Array<
    Omit<LeagueMembership, 'display_name' | 'pint_total'> & {
      profile: { display_name: string } | { display_name: string }[] | null;
    }
  >).map((member) => {
    const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
    return {
      ...member,
      display_name: profile?.display_name || 'Player',
      pint_total: 0,
    };
  });

  return {
    league: league as LeagueDashboard['league'],
    members: normalizedMembers,
  };
}

export async function getMyProfile(userId: string) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, display_name, avatar_url, created_at, updated_at')
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
    .select('id, display_name, avatar_url, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}