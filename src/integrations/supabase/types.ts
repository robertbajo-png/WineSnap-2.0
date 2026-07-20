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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          acidity: number | null
          avatar_url: string | null
          body: number | null
          created_at: string
          display_name: string | null
          hide_disliked: boolean
          id: string
          new_arrivals_alerts: boolean
          oak: number | null
          onboarded_at: string | null
          personalized_recs: boolean
          preferred_grapes: string[] | null
          preferred_regions: string[] | null
          preferred_types: string[] | null
          price_max: number | null
          price_min: number | null
          sweetness: number | null
          tannin: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          acidity?: number | null
          avatar_url?: string | null
          body?: number | null
          created_at?: string
          display_name?: string | null
          hide_disliked?: boolean
          id: string
          new_arrivals_alerts?: boolean
          oak?: number | null
          onboarded_at?: string | null
          personalized_recs?: boolean
          preferred_grapes?: string[] | null
          preferred_regions?: string[] | null
          preferred_types?: string[] | null
          price_max?: number | null
          price_min?: number | null
          sweetness?: number | null
          tannin?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          acidity?: number | null
          avatar_url?: string | null
          body?: number | null
          created_at?: string
          display_name?: string | null
          hide_disliked?: boolean
          id?: string
          new_arrivals_alerts?: boolean
          oak?: number | null
          onboarded_at?: string | null
          personalized_recs?: boolean
          preferred_grapes?: string[] | null
          preferred_regions?: string[] | null
          preferred_types?: string[] | null
          price_max?: number | null
          price_min?: number | null
          sweetness?: number | null
          tannin?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      taste_profile: {
        Row: {
          avg_acidity: number | null
          avg_body: number | null
          avg_fruit: number | null
          avg_oak: number | null
          avg_sweetness: number | null
          avg_tannin: number | null
          favorite_grapes: Json | null
          favorite_regions: Json | null
          favorite_types: Json | null
          total_wines: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_acidity?: number | null
          avg_body?: number | null
          avg_fruit?: number | null
          avg_oak?: number | null
          avg_sweetness?: number | null
          avg_tannin?: number | null
          favorite_grapes?: Json | null
          favorite_regions?: Json | null
          favorite_types?: Json | null
          total_wines?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_acidity?: number | null
          avg_body?: number | null
          avg_fruit?: number | null
          avg_oak?: number | null
          avg_sweetness?: number | null
          avg_tannin?: number | null
          favorite_grapes?: Json | null
          favorite_regions?: Json | null
          favorite_types?: Json | null
          total_wines?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasting_notes: {
        Row: {
          acidity: number | null
          aromas: string[] | null
          body: number | null
          created_at: string
          finish: string | null
          id: string
          location: string | null
          notes: string | null
          rating: number | null
          sweetness: number | null
          tannin: number | null
          tasted_at: string
          updated_at: string
          user_id: string
          wine_id: string
        }
        Insert: {
          acidity?: number | null
          aromas?: string[] | null
          body?: number | null
          created_at?: string
          finish?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          rating?: number | null
          sweetness?: number | null
          tannin?: number | null
          tasted_at?: string
          updated_at?: string
          user_id: string
          wine_id: string
        }
        Update: {
          acidity?: number | null
          aromas?: string[] | null
          body?: number | null
          created_at?: string
          finish?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          rating?: number | null
          sweetness?: number | null
          tannin?: number | null
          tasted_at?: string
          updated_at?: string
          user_id?: string
          wine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasting_notes_wine_id_fkey"
            columns: ["wine_id"]
            isOneToOne: false
            referencedRelation: "wines"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wine_photos: {
        Row: {
          created_at: string
          id: string
          kind: string
          sort_order: number
          storage_path: string | null
          url: string
          user_id: string
          wine_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          sort_order?: number
          storage_path?: string | null
          url: string
          user_id: string
          wine_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          sort_order?: number
          storage_path?: string | null
          url?: string
          user_id?: string
          wine_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wine_photos_wine_id_fkey"
            columns: ["wine_id"]
            isOneToOne: false
            referencedRelation: "wines"
            referencedColumns: ["id"]
          },
        ]
      }
      wines: {
        Row: {
          acidity: number | null
          ai_raw: Json | null
          body: number | null
          consumed_at: string | null
          country: string | null
          created_at: string
          decant: boolean | null
          description: string | null
          food_pairings: Json | null
          fruit: number | null
          glass_type: string | null
          grape_varieties: string[] | null
          id: string
          image_url: string | null
          notes: string | null
          oak: number | null
          primary_notes: string[] | null
          producer: string | null
          purchase_currency: string | null
          purchase_price: number | null
          purchased_at: string | null
          quantity: number
          region: string | null
          secondary_notes: string[] | null
          serving_temp: string | null
          sweetness: number | null
          tannin: number | null
          tertiary_notes: string[] | null
          updated_at: string
          user_id: string
          user_rating: number | null
          vintage: number | null
          wine_name: string | null
          wine_type: Database["public"]["Enums"]["wine_type"] | null
        }
        Insert: {
          acidity?: number | null
          ai_raw?: Json | null
          body?: number | null
          consumed_at?: string | null
          country?: string | null
          created_at?: string
          decant?: boolean | null
          description?: string | null
          food_pairings?: Json | null
          fruit?: number | null
          glass_type?: string | null
          grape_varieties?: string[] | null
          id?: string
          image_url?: string | null
          notes?: string | null
          oak?: number | null
          primary_notes?: string[] | null
          producer?: string | null
          purchase_currency?: string | null
          purchase_price?: number | null
          purchased_at?: string | null
          quantity?: number
          region?: string | null
          secondary_notes?: string[] | null
          serving_temp?: string | null
          sweetness?: number | null
          tannin?: number | null
          tertiary_notes?: string[] | null
          updated_at?: string
          user_id: string
          user_rating?: number | null
          vintage?: number | null
          wine_name?: string | null
          wine_type?: Database["public"]["Enums"]["wine_type"] | null
        }
        Update: {
          acidity?: number | null
          ai_raw?: Json | null
          body?: number | null
          consumed_at?: string | null
          country?: string | null
          created_at?: string
          decant?: boolean | null
          description?: string | null
          food_pairings?: Json | null
          fruit?: number | null
          glass_type?: string | null
          grape_varieties?: string[] | null
          id?: string
          image_url?: string | null
          notes?: string | null
          oak?: number | null
          primary_notes?: string[] | null
          producer?: string | null
          purchase_currency?: string | null
          purchase_price?: number | null
          purchased_at?: string | null
          quantity?: number
          region?: string | null
          secondary_notes?: string[] | null
          serving_temp?: string | null
          sweetness?: number | null
          tannin?: number | null
          tertiary_notes?: string[] | null
          updated_at?: string
          user_id?: string
          user_rating?: number | null
          vintage?: number | null
          wine_name?: string | null
          wine_type?: Database["public"]["Enums"]["wine_type"] | null
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          ai_data: Json | null
          country: string | null
          created_at: string
          current_price: number | null
          description: string | null
          grape_varieties: string[] | null
          id: string
          image_url: string | null
          last_checked_at: string | null
          last_checked_price: number | null
          last_price_check: string | null
          notes: string | null
          notify_on_drop: boolean
          price_alert_seen_at: string | null
          price_alert_triggered_at: string | null
          price_currency: string | null
          price_source: string | null
          priority: number
          producer: string | null
          region: string | null
          source: string
          systembolaget_id: string | null
          systembolaget_url: string | null
          target_price: number | null
          updated_at: string
          user_id: string
          vintage: number | null
          wine_id: string | null
          wine_name: string
          wine_type: string | null
        }
        Insert: {
          ai_data?: Json | null
          country?: string | null
          created_at?: string
          current_price?: number | null
          description?: string | null
          grape_varieties?: string[] | null
          id?: string
          image_url?: string | null
          last_checked_at?: string | null
          last_checked_price?: number | null
          last_price_check?: string | null
          notes?: string | null
          notify_on_drop?: boolean
          price_alert_seen_at?: string | null
          price_alert_triggered_at?: string | null
          price_currency?: string | null
          price_source?: string | null
          priority?: number
          producer?: string | null
          region?: string | null
          source?: string
          systembolaget_id?: string | null
          systembolaget_url?: string | null
          target_price?: number | null
          updated_at?: string
          user_id: string
          vintage?: number | null
          wine_id?: string | null
          wine_name: string
          wine_type?: string | null
        }
        Update: {
          ai_data?: Json | null
          country?: string | null
          created_at?: string
          current_price?: number | null
          description?: string | null
          grape_varieties?: string[] | null
          id?: string
          image_url?: string | null
          last_checked_at?: string | null
          last_checked_price?: number | null
          last_price_check?: string | null
          notes?: string | null
          notify_on_drop?: boolean
          price_alert_seen_at?: string | null
          price_alert_triggered_at?: string | null
          price_currency?: string | null
          price_source?: string | null
          priority?: number
          producer?: string | null
          region?: string | null
          source?: string
          systembolaget_id?: string | null
          systembolaget_url?: string | null
          target_price?: number | null
          updated_at?: string
          user_id?: string
          vintage?: number | null
          wine_id?: string | null
          wine_name?: string
          wine_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_wine_id_fkey"
            columns: ["wine_id"]
            isOneToOne: false
            referencedRelation: "wines"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recompute_taste_profile: {
        Args: { _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      wine_type:
        | "red"
        | "white"
        | "rose"
        | "sparkling"
        | "dessert"
        | "fortified"
        | "orange"
        | "unknown"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      wine_type: [
        "red",
        "white",
        "rose",
        "sparkling",
        "dessert",
        "fortified",
        "orange",
        "unknown",
      ],
    },
  },
} as const
