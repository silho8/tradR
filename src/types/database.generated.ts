/**
 * Generated from the live tradR Supabase schema on 2026-10-25.
 * This is a client type snapshot, NOT a replacement for missing SQL migrations.
 * Regenerate after schema changes using Supabase type generation.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      listing_subscriptions: {
        Row: {
          amount_ngn: number
          created_at: string
          expires_at: string | null
          id: string
          listing_id: string
          starts_at: string | null
          status: string
          vendor_id: string
        }
        Insert: {
          amount_ngn?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          listing_id: string
          starts_at?: string | null
          status: string
          vendor_id: string
        }
        Update: {
          amount_ngn?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          listing_id?: string
          starts_at?: string | null
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_subscriptions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_subscriptions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          image_urls: string[]
          moderation_status: string
          price_ngn: number
          reviewed_at: string | null
          reviewed_by: string | null
          search_document: unknown
          status: string
          title: string
          updated_at: string
          vendor_id: string
          visible_until: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          image_urls?: string[]
          moderation_status?: string
          price_ngn: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_document?: unknown
          status?: string
          title: string
          updated_at?: string
          vendor_id: string
          visible_until?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          image_urls?: string[]
          moderation_status?: string
          price_ngn?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          search_document?: unknown
          status?: string
          title?: string
          updated_at?: string
          vendor_id?: string
          visible_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_ngn: number
          created_at: string
          currency: string
          id: string
          listing_subscription_id: string
          provider: string
          provider_transaction_id: string | null
          status: string
          tx_ref: string | null
          vendor_id: string
          verified_at: string | null
        }
        Insert: {
          amount_ngn: number
          created_at?: string
          currency?: string
          id?: string
          listing_subscription_id: string
          provider?: string
          provider_transaction_id?: string | null
          status?: string
          tx_ref?: string | null
          vendor_id: string
          verified_at?: string | null
        }
        Update: {
          amount_ngn?: number
          created_at?: string
          currency?: string
          id?: string
          listing_subscription_id?: string
          provider?: string
          provider_transaction_id?: string | null
          status?: string
          tx_ref?: string | null
          vendor_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_listing_subscription_id_fkey"
            columns: ["listing_subscription_id"]
            isOneToOne: false
            referencedRelation: "listing_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string
          id: string
          listing_id: string | null
          reason: string
          reporter_id: string
          status: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string
          id?: string
          listing_id?: string | null
          reason: string
          reporter_id: string
          status?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          listing_id?: string | null
          reason?: string
          reporter_id?: string
          status?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_reports: {
        Row: {
          created_at: string
          details: string
          evidence_paths: string[]
          id: string
          listing_id: string | null
          reason: string
          reporter_id: string
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          details: string
          evidence_paths?: string[]
          id?: string
          listing_id?: string | null
          reason: string
          reporter_id: string
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          details?: string
          evidence_paths?: string[]
          id?: string
          listing_id?: string | null
          reason?: string
          reporter_id?: string
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_reports_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          bio: string
          created_at: string
          id: string
          logo_url: string | null
          profile_id: string
          shop_name: string
          updated_at: string
          verification_status: string
          whatsapp_number: string
        }
        Insert: {
          bio?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          profile_id: string
          shop_name: string
          updated_at?: string
          verification_status?: string
          whatsapp_number: string
        }
        Update: {
          bio?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          profile_id?: string
          shop_name?: string
          updated_at?: string
          verification_status?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_listing_subscription_internal: {
        Args: { p_provider_transaction_id: string; p_tx_ref: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
