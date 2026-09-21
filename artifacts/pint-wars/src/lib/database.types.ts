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
          free_trial_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          avatar_url?: string | null;
          free_trial_used_at?: string | null;
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
          pub_provider: string | null;
          pub_place_id: string | null;
          pub_name: string | null;
          pub_address: string | null;
          pub_latitude: number | null;
          pub_longitude: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pub_reviews: {
        Row: {
          id: string;
          user_id: string;
          pub_provider: 'google_places';
          pub_place_id: string;
          pub_name: string;
          pub_address: string;
          atmosphere_rating: number;
          pints_drinks_rating: number;
          staff_rating: number;
          music_rating: number;
          food_rating: number | null;
          value_rating: number | null;
          would_return: boolean;
          review_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pub_review_reports: {
        Row: {
          id: string;
          review_id: string;
          reporter_id: string;
          reason: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          notification_type: 'player_joined' | 'pint_logged' | 'war_ending_soon' | 'war_finished' | 'winner';
          title: string;
          body: string;
          league_id: string | null;
          read_at: string | null;
          created_at: string;
          event_key: string;
        };
        Insert: never;
        Update: {
          read_at?: string | null;
        };
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
      retire_from_league: {
        Args: { p_league_id: string };
        Returns: undefined;
      };
      log_pint: {
        Args:
          | {
              p_league_id: string;
              p_photo_path: string;
              p_latitude?: number | null;
              p_longitude?: number | null;
            }
          | {
              p_league_id: string;
              p_photo_path: string;
              p_latitude: number | null;
              p_longitude: number | null;
              p_pub_provider: string | null;
              p_pub_place_id: string | null;
              p_pub_name: string | null;
              p_pub_address: string | null;
              p_pub_latitude: number | null;
              p_pub_longitude: number | null;
            };
        Returns: { pint_id: string; logged_at: string }[];
      };
      get_league_pint_totals: {
        Args: { p_league_id: string };
        Returns: { user_id: string; pint_total: number }[];
      };
      get_my_pub_passport: {
        Args: Record<string, never>;
        Returns: {
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
        }[];
      };
      can_review_pub: {
        Args: { p_pub_provider: string; p_pub_place_id: string };
        Returns: boolean;
      };
      get_pub_review_summary: {
        Args: { p_pub_provider: string; p_pub_place_id: string };
        Returns: {
          pub_provider: string;
          pub_place_id: string;
          review_count: number;
          average_atmosphere: number | null;
          average_pints_drinks: number | null;
          average_staff: number | null;
          average_music: number | null;
          average_food: number | null;
          average_value: number | null;
          would_return_count: number;
          current_user_review_id: string | null;
        }[];
      };
      get_pub_reviews: {
        Args: {
          p_pub_provider: string;
          p_pub_place_id: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: ReviewRpcRow[];
      };
      get_pub_review_detail: {
        Args: { p_review_id: string };
        Returns: ReviewRpcRow[];
      };
      create_pub_review: {
        Args: {
          p_pub_provider: string;
          p_pub_place_id: string;
          p_pint_log_id: string;
          p_atmosphere_rating: number;
          p_pints_drinks_rating: number;
          p_staff_rating: number;
          p_music_rating: number;
          p_food_rating?: number | null;
          p_value_rating?: number | null;
          p_would_return: boolean;
          p_review_text?: string | null;
        };
        Returns: { review_id: string; pub_provider: string; pub_place_id: string }[];
      };
      update_pub_review: {
        Args: {
          p_review_id: string;
          p_atmosphere_rating: number;
          p_pints_drinks_rating: number;
          p_staff_rating: number;
          p_music_rating: number;
          p_food_rating?: number | null;
          p_value_rating?: number | null;
          p_would_return: boolean;
          p_review_text?: string | null;
        };
        Returns: { review_id: string; updated_at: string }[];
      };
      delete_pub_review: {
        Args: { p_review_id: string };
        Returns: boolean;
      };
      report_pub_review: {
        Args: { p_review_id: string; p_reason: string };
        Returns: string;
      };
      get_my_notifications: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          notification_type: 'player_joined' | 'pint_logged' | 'war_ending_soon' | 'war_finished' | 'winner';
          title: string;
          body: string;
          league_id: string | null;
          read_at: string | null;
          created_at: string;
        }[];
      };
      get_my_unread_notification_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      mark_notification_read: {
        Args: { p_notification_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ReviewRpcRow = {
  id: string;
  user_id: string;
  author_name: string;
  pub_provider: string;
  pub_place_id: string;
  pub_name: string;
  pub_address: string;
  atmosphere_rating: number;
  pints_drinks_rating: number;
  staff_rating: number;
  music_rating: number;
  food_rating: number | null;
  value_rating: number | null;
  would_return: boolean;
  review_text: string | null;
  created_at: string;
  updated_at: string;
};