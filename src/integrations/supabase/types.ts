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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      cards: {
        Row: {
          brand: string
          card_number: string
          created_at: string
          cvv: string
          expiry_month: number
          expiry_year: number
          holder_name: string
          id: string
          status: Database["public"]["Enums"]["card_status"]
          tier: Database["public"]["Enums"]["card_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string
          card_number: string
          created_at?: string
          cvv: string
          expiry_month: number
          expiry_year: number
          holder_name: string
          id?: string
          status?: Database["public"]["Enums"]["card_status"]
          tier?: Database["public"]["Enums"]["card_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string
          card_number?: string
          created_at?: string
          cvv?: string
          expiry_month?: number
          expiry_year?: number
          holder_name?: string
          id?: string
          status?: Database["public"]["Enums"]["card_status"]
          tier?: Database["public"]["Enums"]["card_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          block_reason: string | null
          created_at: string
          currency: string
          current_step: string | null
          from_wallet_id: string
          id: string
          progress: number
          recipient_block_reason: string | null
          recipient_current_step: string | null
          recipient_identifier: string
          recipient_progress: number
          recipient_status: string
          recipient_user_id: string | null
          recipient_wallet_id: string | null
          reference: string | null
          required_documents: Json
          sender_id: string
          status: Database["public"]["Enums"]["transfer_status"]
          submitted_documents: Json
          updated_at: string
        }
        Insert: {
          amount: number
          block_reason?: string | null
          created_at?: string
          currency: string
          current_step?: string | null
          from_wallet_id: string
          id?: string
          progress?: number
          recipient_block_reason?: string | null
          recipient_current_step?: string | null
          recipient_identifier: string
          recipient_progress?: number
          recipient_status?: string
          recipient_user_id?: string | null
          recipient_wallet_id?: string | null
          reference?: string | null
          required_documents?: Json
          sender_id: string
          status?: Database["public"]["Enums"]["transfer_status"]
          submitted_documents?: Json
          updated_at?: string
        }
        Update: {
          amount?: number
          block_reason?: string | null
          created_at?: string
          currency?: string
          current_step?: string | null
          from_wallet_id?: string
          id?: string
          progress?: number
          recipient_block_reason?: string | null
          recipient_current_step?: string | null
          recipient_identifier?: string
          recipient_progress?: number
          recipient_status?: string
          recipient_user_id?: string | null
          recipient_wallet_id?: string | null
          reference?: string | null
          required_documents?: Json
          sender_id?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          submitted_documents?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_recipient_wallet_id_fkey"
            columns: ["recipient_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
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
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          id: string
          is_primary: boolean
          label: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency: Database["public"]["Enums"]["wallet_currency"]
          id?: string
          is_primary?: boolean
          label?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["wallet_currency"]
          id?: string
          is_primary?: boolean
          label?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_wallet: {
        Args: { _delta: number; _reason: string; _wallet_id: string }
        Returns: number
      }
      admin_clear_recipient_block: {
        Args: { _transfer_id: string }
        Returns: undefined
      }
      admin_list_clients: {
        Args: never
        Returns: {
          card_id: string
          card_last4: string
          card_status: Database["public"]["Enums"]["card_status"]
          card_tier: Database["public"]["Enums"]["card_tier"]
          email: string
          full_name: string
          is_admin: boolean
          is_compliance: boolean
          kyc_status: string
          total_cad: number
          user_id: string
        }[]
      }
      admin_set_card_status: {
        Args: {
          _card_id: string
          _status: Database["public"]["Enums"]["card_status"]
        }
        Returns: {
          brand: string
          card_number: string
          created_at: string
          cvv: string
          expiry_month: number
          expiry_year: number
          holder_name: string
          id: string
          status: Database["public"]["Enums"]["card_status"]
          tier: Database["public"]["Enums"]["card_tier"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_card_tier: {
        Args: {
          _card_id: string
          _tier: Database["public"]["Enums"]["card_tier"]
        }
        Returns: {
          brand: string
          card_number: string
          created_at: string
          cvv: string
          expiry_month: number
          expiry_year: number
          holder_name: string
          id: string
          status: Database["public"]["Enums"]["card_status"]
          tier: Database["public"]["Enums"]["card_tier"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_kyc_status: {
        Args: { _status: string; _user_id: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_user_wallets: {
        Args: { _user_id: string }
        Returns: {
          balance: number
          currency: string
          id: string
          is_primary: boolean
          label: string
        }[]
      }
      block_transfer: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      card_history: {
        Args: { _card_id: string }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json
        }[]
      }
      claim_admin_if_none: { Args: never; Returns: boolean }
      complete_transfer: { Args: { _id: string }; Returns: undefined }
      compute_required_documents: {
        Args: { _amount_cad: number }
        Returns: Json
      }
      edd_tier_label: { Args: { _amount_cad: number }; Returns: string }
      generate_card_for_user: {
        Args: {
          _holder_name: string
          _tier?: Database["public"]["Enums"]["card_tier"]
          _user_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_notifications_read: { Args: { _ids: string[] }; Returns: undefined }
      notify_user: {
        Args: {
          _body: string
          _meta?: Json
          _title: string
          _type: string
          _user_id: string
        }
        Returns: string
      }
      recipient_submit_documents: {
        Args: { _documents: Json; _transfer_id: string }
        Returns: undefined
      }
      start_transfer: {
        Args: {
          _amount: number
          _from_wallet: string
          _recipient: string
          _reference?: string
        }
        Returns: string
      }
      submit_kyc: {
        Args: {
          _country: string
          _doc_number: string
          _doc_type: string
          _full_name: string
        }
        Returns: undefined
      }
      update_transfer_progress: {
        Args: { _id: string; _progress: number; _step: string }
        Returns: undefined
      }
      user_total_cad: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "client" | "compliance_officer" | "admin"
      card_status: "active" | "blocked" | "expired"
      card_tier: "standard" | "gold_plus"
      kyc_status: "pending" | "in_review" | "verified" | "rejected"
      transfer_status:
        | "verifying"
        | "blocked"
        | "success"
        | "failed"
        | "cancelled"
      wallet_currency: "CAD" | "EUR" | "USD"
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
      app_role: ["client", "compliance_officer", "admin"],
      card_status: ["active", "blocked", "expired"],
      card_tier: ["standard", "gold_plus"],
      kyc_status: ["pending", "in_review", "verified", "rejected"],
      transfer_status: [
        "verifying",
        "blocked",
        "success",
        "failed",
        "cancelled",
      ],
      wallet_currency: ["CAD", "EUR", "USD"],
    },
  },
} as const
