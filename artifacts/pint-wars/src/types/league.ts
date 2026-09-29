export type LeagueStatus = 'active' | 'completed';
export type MembershipStatus = 'active' | 'retired' | 'removed';
export type LeaguePoints = number;

export const CURRENT_LEAGUE_SCORING = {
  pointsPerValidPint: 1,
  reviewBonusPoints: 1,
} as const;

export type League = {
  id: string;
  name: string;
  host_id: string;
  capacity: number;
  is_free: boolean;
  status: LeagueStatus;
  starts_at: string;
  ends_at: string;
  duration_days: number | null;
  created_at: string;
  completed_at: string | null;
};

export type LeagueMembership = {
  id: string;
  league_id: string;
  user_id: string;
  role: 'host' | 'player';
  status: MembershipStatus;
  joined_at: string;
  retired_at: string | null;
  removed_at: string | null;
  display_name: string;
  points: LeaguePoints;
};

export type MyLeague = {
  membershipId: string;
  role: 'host' | 'player';
  membershipStatus: MembershipStatus;
  league: League;
};

export type LeagueDashboard = {
  league: League;
  members: LeagueMembership[];
};

export type LeagueSummaryStats = {
  player_count: number;
  total_pints: number;
  pubs_visited: number;
  new_pub_bonuses: number;
  reviews: number;
  total_points: LeaguePoints;
};

export type LeagueSummary = {
  league: League;
  stats: LeagueSummaryStats;
  leaderboard: LeagueMembership[];
};