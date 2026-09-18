export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      leagues: {
        Row: {
          id: string;
          name: string;
          host_id: string;
          capacity: number;
          is_free: boolean;
          status: 'active' | 'completed';
          starts_at: string;
          ends_at: string;
          created_at: string;
          completed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      league_memberships: {
        Row: {
          id: string;
          league_id: string;
          user_id: string;
          role: 'host' | 'player';
          status: 'active' | 'retired' | 'removed';
          joined_at: string;
          retired_at: string | null;
          removed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      league_invites: {
        Row: {
          id: string;
          league_id: string;
          created_by: string;
          code: string;
          expires_at: string;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pint_logs: {
        Row: {
          id: string;
          league_id: string;
          user_id: string;
          photo_path: string;
          logged_at: string;
          latitude: number | null;
          longitude: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_free_league: {
        Args: { p_name: string };
        Returns: { league_id: string; invite_code: string }[];
      };
      join_league_by_code: {
        Args: { p_code: string };
        Returns: { league_id: string }[];
      };
      create_league_invite: {
        Args: { p_league_id: string };
        Returns: { invite_code: string }[];
      };
      refresh_my_league_statuses: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      complete_expired_league: {
        Args: { p_league_id: string };
        Returns: undefined;
      };
      log_pint: {
        Args: {
          p_league_id: string;
          p_photo_path: string;
          p_latitude?: number | null;
          p_longitude?: number | null;
        };
        Returns: { pint_id: string; logged_at: string }[];
      };
      get_league_pint_totals: {
        Args: { p_league_id: string };
        Returns: { user_id: string; pint_total: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};