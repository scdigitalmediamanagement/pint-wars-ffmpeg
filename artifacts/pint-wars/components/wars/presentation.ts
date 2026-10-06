import type { League, LeagueDashboard, MyLeague } from '../../src/types/league';

export function currentLeague(item: MyLeague, dashboard?: LeagueDashboard) {
  // A cached active dashboard must not undo a completion returned by my-leagues.
  return item.league.status === 'completed' ? item.league : dashboard?.league ?? item.league;
}

export function ordinal(rank: number) {
  const lastTwo = rank % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th'
    : rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th';
  return `${rank}${suffix}`;
}

export function dayLabel(league: League, now: number) {
  const start = new Date(league.starts_at).getTime();
  const end = new Date(league.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Schedule unavailable';
  const duration = league.duration_days != null && league.duration_days > 0
    ? league.duration_days : Math.max(1, Math.ceil((end - start) / 86_400_000));
  const completed = league.completed_at ? new Date(league.completed_at).getTime() : end;
  const at = league.status === 'completed' ? (Number.isFinite(completed) ? completed : end) : now;
  const day = Math.max(1, Math.min(duration, Math.floor((Math.min(at, end) - start) / 86_400_000) + 1));
  return `Day ${day} of ${duration}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${Array.from(parts[0])[0]}${Array.from(parts[parts.length - 1])[0]}`.toUpperCase()
    : Array.from(parts[0] ?? '?').slice(0, 2).join('').toUpperCase();
}

export function leagueStanding(item: MyLeague, dashboard?: LeagueDashboard) {
  const members = dashboard?.members.filter((member) => member.status !== 'removed');
  const me = item.membershipStatus === 'removed' ? undefined
    : members?.find((member) => member.id === item.membershipId);
  // Competition ranking matches the existing league screen, including ties.
  const rank = me && members ? 1 + members.filter((member) => member.points > me.points).length : undefined;
  return { members, me, rank };
}
