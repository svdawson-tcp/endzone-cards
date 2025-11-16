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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      cash_transactions: {
        Row: {
          amount: number
          corrected_at: string | null
          correction_count: number | null
          correction_note: string | null
          created_at: string
          id: string
          notes: string | null
          related_expense_id: string | null
          related_lot_id: string | null
          related_transaction_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          related_expense_id?: string | null
          related_lot_id?: string | null
          related_transaction_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          related_expense_id?: string | null
          related_lot_id?: string | null
          related_transaction_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_related_expense_id_fkey"
            columns: ["related_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_related_lot_id_fkey"
            columns: ["related_lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          corrected_at: string | null
          correction_count: number | null
          correction_note: string | null
          created_at: string
          expense_date: string
          id: string
          notes: string | null
          receipt_photo_url: string | null
          show_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          expense_date: string
          id?: string
          notes?: string | null
          receipt_photo_url?: string | null
          show_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          expense_date?: string
          id?: string
          notes?: string | null
          receipt_photo_url?: string | null
          show_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          closure_date: string | null
          closure_reason: string | null
          created_at: string
          id: string
          notes: string | null
          purchase_date: string
          source: string
          status: string
          total_cost: number
          updated_at: string
          user_id: string
        }
        Insert: {
          closure_date?: string | null
          closure_reason?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          purchase_date: string
          source: string
          status?: string
          total_cost: number
          updated_at?: string
          user_id: string
        }
        Update: {
          closure_date?: string | null
          closure_reason?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          purchase_date?: string
          source?: string
          status?: string
          total_cost?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      show_cards: {
        Row: {
          asking_price: number | null
          card_details: Json | null
          cost_basis: number | null
          created_at: string
          destination_lot_id: string | null
          disposition_type: string | null
          id: string
          lot_id: string
          photo_back_url: string | null
          photo_front_url: string | null
          player_name: string
          status: string
          updated_at: string
          user_id: string
          year: string | null
        }
        Insert: {
          asking_price?: number | null
          card_details?: Json | null
          cost_basis?: number | null
          created_at?: string
          destination_lot_id?: string | null
          disposition_type?: string | null
          id?: string
          lot_id: string
          photo_back_url?: string | null
          photo_front_url?: string | null
          player_name: string
          status?: string
          updated_at?: string
          user_id: string
          year?: string | null
        }
        Update: {
          asking_price?: number | null
          card_details?: Json | null
          cost_basis?: number | null
          created_at?: string
          destination_lot_id?: string | null
          disposition_type?: string | null
          id?: string
          lot_id?: string
          photo_back_url?: string | null
          photo_front_url?: string | null
          player_name?: string
          status?: string
          updated_at?: string
          user_id?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "show_cards_destination_lot_id_fkey"
            columns: ["destination_lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "show_cards_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      shows: {
        Row: {
          booth_number: string | null
          created_at: string
          id: string
          location: string | null
          name: string
          notes: string | null
          show_date: string
          status: string
          table_cost: number
          updated_at: string
          user_id: string
        }
        Insert: {
          booth_number?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          show_date: string
          status?: string
          table_cost?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          booth_number?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          show_date?: string
          status?: string
          table_cost?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          corrected_at: string | null
          correction_count: number | null
          correction_note: string | null
          created_at: string
          deleted: boolean | null
          deleted_at: string | null
          deletion_reason: string | null
          id: string
          lot_id: string | null
          notes: string | null
          quantity: number | null
          revenue: number
          show_card_id: string | null
          show_id: string | null
          transaction_date: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          deleted?: boolean | null
          deleted_at?: string | null
          deletion_reason?: string | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          quantity?: number | null
          revenue?: number
          show_card_id?: string | null
          show_id?: string | null
          transaction_date?: string
          transaction_type: string
          user_id: string
        }
        Update: {
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          deleted?: boolean | null
          deleted_at?: string | null
          deletion_reason?: string | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          quantity?: number | null
          revenue?: number
          show_card_id?: string | null
          show_id?: string | null
          transaction_date?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_show_card_id_fkey"
            columns: ["show_card_id"]
            isOneToOne: false
            referencedRelation: "show_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      user_goals: {
        Row: {
          action_items: Json | null
          annual_salary: number | null
          created_at: string
          health_insurance: number | null
          id: string
          independence_target_date: string | null
          milestone_12_month: number | null
          milestone_3_month: number | null
          milestone_6_month: number | null
          target_monthly_income: number | null
          tax_rate: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_items?: Json | null
          annual_salary?: number | null
          created_at?: string
          health_insurance?: number | null
          id?: string
          independence_target_date?: string | null
          milestone_12_month?: number | null
          milestone_3_month?: number | null
          milestone_6_month?: number | null
          target_monthly_income?: number | null
          tax_rate?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_items?: Json | null
          annual_salary?: number | null
          created_at?: string
          health_insurance?: number | null
          id?: string
          independence_target_date?: string | null
          milestone_12_month?: number | null
          milestone_3_month?: number | null
          milestone_6_month?: number | null
          target_monthly_income?: number | null
          tax_rate?: number | null
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
      reassign_show_card_sale_to_show: {
        Args: {
          p_correction_note: string
          p_new_show_id: string
          p_transaction_id: string
        }
        Returns: undefined
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
    Enums: {},
  },
} as const
