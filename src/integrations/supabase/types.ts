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
      account_reconciliations: {
        Row: {
          account_id: string
          adjustment_id: string | null
          app_balance: number
          as_of: string
          bank_balance: number
          created_at: string
          difference: number | null
          id: string
          note: string | null
          undeposited: number
          user_id: string
        }
        Insert: {
          account_id: string
          adjustment_id?: string | null
          app_balance: number
          as_of: string
          bank_balance: number
          created_at?: string
          difference?: number | null
          id?: string
          note?: string | null
          undeposited?: number
          user_id: string
        }
        Update: {
          account_id?: string
          adjustment_id?: string | null
          app_balance?: number
          as_of?: string
          bank_balance?: number
          created_at?: string
          difference?: number | null
          id?: string
          note?: string | null
          undeposited?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_reconciliations_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_card_details_20261102: {
        Row: {
          card_details: Json | null
          id: string | null
          player_name: string | null
          saved_at: string | null
        }
        Insert: {
          card_details?: Json | null
          id?: string | null
          player_name?: string | null
          saved_at?: string | null
        }
        Update: {
          card_details?: Json | null
          id?: string | null
          player_name?: string | null
          saved_at?: string | null
        }
        Relationships: []
      }
      backup_web_sale_lot_20261108: {
        Row: {
          backed_up_at: string | null
          new_lot_id: string | null
          old_lot_id: string | null
          transaction_id: string | null
        }
        Insert: {
          backed_up_at?: string | null
          new_lot_id?: string | null
          old_lot_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          backed_up_at?: string | null
          new_lot_id?: string | null
          old_lot_id?: string | null
          transaction_id?: string | null
        }
        Relationships: []
      }
      card_reads: {
        Row: {
          created_at: string
          error: string | null
          id: string
          input_tokens: number | null
          model: string | null
          ok: boolean | null
          output_tokens: number | null
          result: Json | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          ok?: boolean | null
          output_tokens?: number | null
          result?: Json | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          ok?: boolean | null
          output_tokens?: number | null
          result?: Json | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_accounts: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          is_default: boolean
          kind: string
          name: string
          sort_order: number
          target_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          kind: string
          name: string
          sort_order?: number
          target_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          sort_order?: number
          target_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          account_id: string
          amount: number
          corrected_at: string | null
          correction_count: number | null
          correction_note: string | null
          created_at: string
          entry_date: string
          id: string
          notes: string | null
          related_expense_id: string | null
          related_lot_id: string | null
          related_transaction_id: string | null
          tax_authority: string | null
          tax_period: string | null
          transaction_type: string
          transfer_group_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          related_expense_id?: string | null
          related_lot_id?: string | null
          related_transaction_id?: string | null
          tax_authority?: string | null
          tax_period?: string | null
          transaction_type: string
          transfer_group_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          related_expense_id?: string | null
          related_lot_id?: string | null
          related_transaction_id?: string | null
          tax_authority?: string | null
          tax_period?: string | null
          transaction_type?: string
          transfer_group_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
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
          account_id: string | null
          amount: number
          category: string
          corrected_at: string | null
          correction_count: number | null
          correction_note: string | null
          created_at: string
          expense_date: string
          id: string
          notes: string | null
          paid_personally: boolean
          receipt_photo_url: string | null
          related_transaction_id: string | null
          show_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category: string
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          expense_date: string
          id?: string
          notes?: string | null
          paid_personally?: boolean
          receipt_photo_url?: string | null
          related_transaction_id?: string | null
          show_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string
          corrected_at?: string | null
          correction_count?: number | null
          correction_note?: string | null
          created_at?: string
          expense_date?: string
          id?: string
          notes?: string | null
          paid_personally?: boolean
          receipt_photo_url?: string | null
          related_transaction_id?: string | null
          show_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
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
          account_id: string | null
          closure_date: string | null
          closure_reason: string | null
          created_at: string
          id: string
          notes: string | null
          purchase_date: string
          show_id: string | null
          source: string
          status: string
          total_cost: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          closure_date?: string | null
          closure_reason?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          purchase_date: string
          show_id?: string | null
          source: string
          status?: string
          total_cost: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          closure_date?: string | null
          closure_reason?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          purchase_date?: string
          show_id?: string | null
          source?: string
          status?: string
          total_cost?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_access: {
        Row: {
          access_level: string | null
          created_at: string
          expires_at: string | null
          granted_at: string
          id: string
          is_active: boolean
          mentee_user_id: string
          mentor_user_id: string
        }
        Insert: {
          access_level?: string | null
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          is_active?: boolean
          mentee_user_id: string
          mentor_user_id: string
        }
        Update: {
          access_level?: string | null
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          is_active?: boolean
          mentee_user_id?: string
          mentor_user_id?: string
        }
        Relationships: []
      }
      mentor_activity_log: {
        Row: {
          accessed_at: string
          action: string
          id: string
          mentee_user_id: string
          mentor_user_id: string
          page_path: string | null
        }
        Insert: {
          accessed_at?: string
          action: string
          id?: string
          mentee_user_id: string
          mentor_user_id: string
          page_path?: string | null
        }
        Update: {
          accessed_at?: string
          action?: string
          id?: string
          mentee_user_id?: string
          mentor_user_id?: string
          page_path?: string | null
        }
        Relationships: []
      }
      mentor_sessions: {
        Row: {
          id: string
          is_active: boolean
          last_activity: string
          mentee_user_id: string
          mentor_user_id: string
          started_at: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          last_activity?: string
          mentee_user_id: string
          mentor_user_id: string
          started_at?: string
        }
        Update: {
          id?: string
          is_active?: boolean
          last_activity?: string
          mentee_user_id?: string
          mentor_user_id?: string
          started_at?: string
        }
        Relationships: []
      }
      mileage_rates: {
        Row: {
          effective_from: string
          rate: number
          source: string
        }
        Insert: {
          effective_from: string
          rate: number
          source: string
        }
        Update: {
          effective_from?: string
          rate?: number
          source?: string
        }
        Relationships: []
      }
      money_settings: {
        Row: {
          annual_report_from: number
          created_at: string
          first_estimate_due: string
          round_up_transfers: boolean
          setup_completed_at: string | null
          tax_rate: number
          tracker_start: string
          transfer_weekday: number
          updated_at: string
          user_id: string
          weekly_email: boolean
        }
        Insert: {
          annual_report_from?: number
          created_at?: string
          first_estimate_due?: string
          round_up_transfers?: boolean
          setup_completed_at?: string | null
          tax_rate?: number
          tracker_start?: string
          transfer_weekday?: number
          updated_at?: string
          user_id: string
          weekly_email?: boolean
        }
        Update: {
          annual_report_from?: number
          created_at?: string
          first_estimate_due?: string
          round_up_transfers?: boolean
          setup_completed_at?: string | null
          tax_rate?: number
          tracker_start?: string
          transfer_weekday?: number
          updated_at?: string
          user_id?: string
          weekly_email?: boolean
        }
        Relationships: []
      }
      monthly_checkups: {
        Row: {
          answers: Json
          completed_at: string
          items_added: number
          note: string | null
          period: string
          started_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          completed_at?: string
          items_added?: number
          note?: string | null
          period: string
          started_at: string
          user_id: string
        }
        Update: {
          answers?: Json
          completed_at?: string
          items_added?: number
          note?: string | null
          period?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      photo_convert_jobs: {
        Row: {
          card_id: string
          diff: number | null
          error: string | null
          finished_at: string | null
          fired_at: string | null
          had_alpha: boolean | null
          id: number
          new_bytes: number | null
          new_h: number | null
          new_public_ok: boolean | null
          new_url: string | null
          new_w: number | null
          old_bytes: number | null
          old_h: number | null
          old_url: string
          old_w: number | null
          side: string
          status: string
          tries: number
          verified_at: string | null
          verify_fired_at: string | null
          verify_tries: number
        }
        Insert: {
          card_id: string
          diff?: number | null
          error?: string | null
          finished_at?: string | null
          fired_at?: string | null
          had_alpha?: boolean | null
          id?: number
          new_bytes?: number | null
          new_h?: number | null
          new_public_ok?: boolean | null
          new_url?: string | null
          new_w?: number | null
          old_bytes?: number | null
          old_h?: number | null
          old_url: string
          old_w?: number | null
          side: string
          status?: string
          tries?: number
          verified_at?: string | null
          verify_fired_at?: string | null
          verify_tries?: number
        }
        Update: {
          card_id?: string
          diff?: number | null
          error?: string | null
          finished_at?: string | null
          fired_at?: string | null
          had_alpha?: boolean | null
          id?: number
          new_bytes?: number | null
          new_h?: number | null
          new_public_ok?: boolean | null
          new_url?: string | null
          new_w?: number | null
          old_bytes?: number | null
          old_h?: number | null
          old_url?: string
          old_w?: number | null
          side?: string
          status?: string
          tries?: number
          verified_at?: string | null
          verify_fired_at?: string | null
          verify_tries?: number
        }
        Relationships: []
      }
      reminders_state: {
        Row: {
          dismissed_at: string | null
          period_key: string
          reminder_key: string
          snoozed_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          period_key: string
          reminder_key: string
          snoozed_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          period_key?: string
          reminder_key?: string
          snoozed_until?: string | null
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
          held_for: string | null
          held_until: string | null
          id: string
          in_bargain_bin: boolean
          lot_id: string
          offer_floor: number | null
          photo_back_url: string | null
          photo_front_url: string | null
          player_name: string
          show_on_website: boolean
          sport: string | null
          status: string
          team: string | null
          updated_at: string
          user_id: string
          website_listed_at: string | null
          year: string | null
        }
        Insert: {
          asking_price?: number | null
          card_details?: Json | null
          cost_basis?: number | null
          created_at?: string
          destination_lot_id?: string | null
          disposition_type?: string | null
          held_for?: string | null
          held_until?: string | null
          id?: string
          in_bargain_bin?: boolean
          lot_id: string
          offer_floor?: number | null
          photo_back_url?: string | null
          photo_front_url?: string | null
          player_name: string
          show_on_website?: boolean
          sport?: string | null
          status?: string
          team?: string | null
          updated_at?: string
          user_id: string
          website_listed_at?: string | null
          year?: string | null
        }
        Update: {
          asking_price?: number | null
          card_details?: Json | null
          cost_basis?: number | null
          created_at?: string
          destination_lot_id?: string | null
          disposition_type?: string | null
          held_for?: string | null
          held_until?: string | null
          id?: string
          in_bargain_bin?: boolean
          lot_id?: string
          offer_floor?: number | null
          photo_back_url?: string | null
          photo_front_url?: string | null
          player_name?: string
          show_on_website?: boolean
          sport?: string | null
          status?: string
          team?: string | null
          updated_at?: string
          user_id?: string
          website_listed_at?: string | null
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
            foreignKeyName: "show_cards_held_for_fk"
            columns: ["held_for"]
            isOneToOne: false
            referencedRelation: "web_orders"
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
      tasks: {
        Row: {
          created_at: string
          created_by: string
          done_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          title: string
          updated_at: string
          urgent: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          done_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          title: string
          updated_at?: string
          urgent?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          done_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
          urgent?: boolean
          user_id?: string
        }
        Relationships: []
      }
      todo_email_log: {
        Row: {
          created_at: string
          item_count: number
          kind: string
          period_key: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          item_count?: number
          kind: string
          period_key: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          item_count?: number
          kind?: string
          period_key?: string
          status?: string
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
          gross_amount: number | null
          id: string
          lot_id: string | null
          notes: string | null
          platform_fee: number | null
          quantity: number | null
          revenue: number
          sales_channel: string | null
          shipping_out_of_pocket: number | null
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
          gross_amount?: number | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          platform_fee?: number | null
          quantity?: number | null
          revenue?: number
          sales_channel?: string | null
          shipping_out_of_pocket?: number | null
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
          gross_amount?: number | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          platform_fee?: number | null
          quantity?: number | null
          revenue?: number
          sales_channel?: string | null
          shipping_out_of_pocket?: number | null
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
      trips: {
        Row: {
          corrected_at: string | null
          correction_count: number
          created_at: string
          destination: string
          id: string
          lot_id: string | null
          miles: number
          notes: string | null
          purpose: string
          round_trip: boolean
          sell_lead_id: string | null
          show_id: string | null
          trip_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          corrected_at?: string | null
          correction_count?: number
          created_at?: string
          destination: string
          id?: string
          lot_id?: string | null
          miles: number
          notes?: string | null
          purpose: string
          round_trip?: boolean
          sell_lead_id?: string | null
          show_id?: string | null
          trip_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          corrected_at?: string | null
          correction_count?: number
          created_at?: string
          destination?: string
          id?: string
          lot_id?: string | null
          miles?: number
          notes?: string | null
          purpose?: string
          round_trip?: boolean
          sell_lead_id?: string | null
          show_id?: string | null
          trip_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_sell_lead_id_fkey"
            columns: ["sell_lead_id"]
            isOneToOne: false
            referencedRelation: "web_sell_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_show_id_fkey"
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
      web_big_game_events: {
        Row: {
          event_id: string
          league: string
          lines: number
          processed_at: string
        }
        Insert: {
          event_id: string
          league: string
          lines?: number
          processed_at?: string
        }
        Update: {
          event_id?: string
          league?: string
          lines?: number
          processed_at?: string
        }
        Relationships: []
      }
      web_big_games: {
        Row: {
          athlete_id: string
          created_at: string
          event_id: string
          game_at: string
          hidden: boolean
          id: number
          league: string
          line: string
          name_key: string
          opponent: string
          player: string
          score: number
          sport: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          event_id: string
          game_at: string
          hidden?: boolean
          id?: number
          league: string
          line: string
          name_key: string
          opponent: string
          player: string
          score?: number
          sport: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          event_id?: string
          game_at?: string
          hidden?: boolean
          id?: number
          league?: string
          line?: string
          name_key?: string
          opponent?: string
          player?: string
          score?: number
          sport?: string
        }
        Relationships: []
      }
      web_discount_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          kind: string
          percent: number
          user_id: string
          window_days: number | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          kind: string
          percent: number
          user_id: string
          window_days?: number | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          kind?: string
          percent?: number
          user_id?: string
          window_days?: number | null
        }
        Relationships: []
      }
      web_offers: {
        Row: {
          action_token: string
          amount: number
          asking_at_offer: number
          auto_accepted: boolean
          buyer_email: string
          buyer_ip_hash: string | null
          buyer_name: string
          buyer_note: string | null
          counter_amount: number | null
          created_at: string
          final_amount: number | null
          floor_at_offer: number
          id: string
          order_id: string | null
          pay_expires_at: string | null
          pay_token: string | null
          responded_at: string | null
          show_card_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_token: string
          amount: number
          asking_at_offer: number
          auto_accepted?: boolean
          buyer_email: string
          buyer_ip_hash?: string | null
          buyer_name: string
          buyer_note?: string | null
          counter_amount?: number | null
          created_at?: string
          final_amount?: number | null
          floor_at_offer: number
          id?: string
          order_id?: string | null
          pay_expires_at?: string | null
          pay_token?: string | null
          responded_at?: string | null
          show_card_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_token?: string
          amount?: number
          asking_at_offer?: number
          auto_accepted?: boolean
          buyer_email?: string
          buyer_ip_hash?: string | null
          buyer_name?: string
          buyer_note?: string | null
          counter_amount?: number | null
          created_at?: string
          final_amount?: number | null
          floor_at_offer?: number
          id?: string
          order_id?: string | null
          pay_expires_at?: string | null
          pay_token?: string | null
          responded_at?: string | null
          show_card_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "web_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_offers_show_card_id_fkey"
            columns: ["show_card_id"]
            isOneToOne: false
            referencedRelation: "show_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      web_order_items: {
        Row: {
          deal_free: boolean
          description: string
          discount: number
          id: string
          offer_id: string | null
          order_id: string
          price: number
          show_card_id: string
          transaction_id: string | null
        }
        Insert: {
          deal_free?: boolean
          description: string
          discount?: number
          id?: string
          offer_id?: string | null
          order_id: string
          price: number
          show_card_id: string
          transaction_id?: string | null
        }
        Update: {
          deal_free?: boolean
          description?: string
          discount?: number
          id?: string
          offer_id?: string | null
          order_id?: string
          price?: number
          show_card_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_order_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "web_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "web_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_order_items_show_card_id_fkey"
            columns: ["show_card_id"]
            isOneToOne: false
            referencedRelation: "show_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_order_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      web_orders: {
        Row: {
          bonus_card: boolean
          buyer_email: string | null
          buyer_name: string | null
          created_at: string
          deal_discount: number
          discount: number
          discount_code: string | null
          emails_sent_at: string | null
          hold_expires_at: string
          id: string
          offer_id: string | null
          order_number: string
          paid_at: string | null
          problem_note: string | null
          refunded_amount: number
          refunded_at: string | null
          ship_link_id: string | null
          shipped_at: string | null
          shipping: number
          shipping_address: Json | null
          shipping_refund_id: string | null
          shipping_refunded: number | null
          source: string
          status: string
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_card?: boolean
          buyer_email?: string | null
          buyer_name?: string | null
          created_at?: string
          deal_discount?: number
          discount?: number
          discount_code?: string | null
          emails_sent_at?: string | null
          hold_expires_at: string
          id?: string
          offer_id?: string | null
          order_number?: string
          paid_at?: string | null
          problem_note?: string | null
          refunded_amount?: number
          refunded_at?: string | null
          ship_link_id?: string | null
          shipped_at?: string | null
          shipping: number
          shipping_address?: Json | null
          shipping_refund_id?: string | null
          shipping_refunded?: number | null
          source?: string
          status?: string
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal: number
          total: number
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_card?: boolean
          buyer_email?: string | null
          buyer_name?: string | null
          created_at?: string
          deal_discount?: number
          discount?: number
          discount_code?: string | null
          emails_sent_at?: string | null
          hold_expires_at?: string
          id?: string
          offer_id?: string | null
          order_number?: string
          paid_at?: string | null
          problem_note?: string | null
          refunded_amount?: number
          refunded_at?: string | null
          ship_link_id?: string | null
          shipped_at?: string | null
          shipping?: number
          shipping_address?: Json | null
          shipping_refund_id?: string | null
          shipping_refunded?: number | null
          source?: string
          status?: string
          stripe_fee?: number | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_orders_discount_code_fkey"
            columns: ["discount_code"]
            isOneToOne: false
            referencedRelation: "web_discount_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "web_orders_offer_fk"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "web_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_orders_ship_link_id_fkey"
            columns: ["ship_link_id"]
            isOneToOne: false
            referencedRelation: "web_ship_links"
            referencedColumns: ["id"]
          },
        ]
      }
      web_sell_leads: {
        Row: {
          asking_price: number | null
          card_count: string | null
          categories: string[]
          created_at: string
          details: string | null
          era: string | null
          graded: string | null
          handoff: string | null
          heard_from: string | null
          id: string
          ip_hash: string | null
          last_message: string | null
          lot_id: string | null
          offer_amount: number | null
          owner_notes: string | null
          photo_paths: string[]
          responded_at: string | null
          seller_email: string
          seller_name: string
          seller_phone: string | null
          source_page: string | null
          status: string
          updated_at: string
          user_id: string
          zip: string | null
        }
        Insert: {
          asking_price?: number | null
          card_count?: string | null
          categories?: string[]
          created_at?: string
          details?: string | null
          era?: string | null
          graded?: string | null
          handoff?: string | null
          heard_from?: string | null
          id?: string
          ip_hash?: string | null
          last_message?: string | null
          lot_id?: string | null
          offer_amount?: number | null
          owner_notes?: string | null
          photo_paths?: string[]
          responded_at?: string | null
          seller_email: string
          seller_name: string
          seller_phone?: string | null
          source_page?: string | null
          status?: string
          updated_at?: string
          user_id: string
          zip?: string | null
        }
        Update: {
          asking_price?: number | null
          card_count?: string | null
          categories?: string[]
          created_at?: string
          details?: string | null
          era?: string | null
          graded?: string | null
          handoff?: string | null
          heard_from?: string | null
          id?: string
          ip_hash?: string | null
          last_message?: string | null
          lot_id?: string | null
          offer_amount?: number | null
          owner_notes?: string | null
          photo_paths?: string[]
          responded_at?: string | null
          seller_email?: string
          seller_name?: string
          seller_phone?: string | null
          source_page?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_sell_leads_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      web_ship_links: {
        Row: {
          closed_at: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          expires_at: string | null
          id: string
          kind: string
          note: string | null
          order_id: string | null
          token: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          note?: string | null
          order_id?: string | null
          token: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          order_id?: string | null
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_ship_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "web_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      website_hunt: {
        Row: {
          created_at: string
          id: string
          note: string | null
          pay_up_to: number | null
          photo_url: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          pay_up_to?: number | null
          photo_url: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          pay_up_to?: number | null
          photo_url?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
          visible?: boolean
        }
        Relationships: []
      }
      website_settings: {
        Row: {
          bin_deal_buy: number | null
          bonus_card_min: number | null
          headliner_card_id: string | null
          headliner_note: string | null
          hold_minutes: number
          id: boolean
          offer_floor_pct: number
          offer_hold_hours: number
          offers_enabled: boolean
          owner_user_id: string
          shipping_flat: number
        }
        Insert: {
          bin_deal_buy?: number | null
          bonus_card_min?: number | null
          headliner_card_id?: string | null
          headliner_note?: string | null
          hold_minutes?: number
          id?: boolean
          offer_floor_pct?: number
          offer_hold_hours?: number
          offers_enabled?: boolean
          owner_user_id: string
          shipping_flat?: number
        }
        Update: {
          bin_deal_buy?: number | null
          bonus_card_min?: number | null
          headliner_card_id?: string | null
          headliner_note?: string | null
          hold_minutes?: number
          id?: boolean
          offer_floor_pct?: number
          offer_hold_hours?: number
          offers_enabled?: boolean
          owner_user_id?: string
          shipping_flat?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_settings_headliner_card_id_fkey"
            columns: ["headliner_card_id"]
            isOneToOne: false
            referencedRelation: "show_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      website_shows: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          kind: string
          location: string | null
          name: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          kind?: string
          location?: string | null
          name: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          kind?: string
          location?: string | null
          name?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      website_wanted: {
        Row: {
          created_at: string
          id: string
          player_name: string
          position: string
          sort_order: number
          sport: string
          stamp: string | null
          top_rank: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_name: string
          position: string
          sort_order?: number
          sport: string
          stamp?: string | null
          top_rank?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_name?: string
          position?: string
          sort_order?: number
          sport?: string
          stamp?: string | null
          top_rank?: number | null
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
      checkup_done: {
        Args: { p_period: string; p_user_id: string }
        Returns: boolean
      }
      claim_card_read: {
        Args: { p_daily_cap: number; p_source?: string; p_user: string }
        Returns: string
      }
      complete_checkup: {
        Args: {
          p_answers: Json
          p_note?: string
          p_period: string
          p_started_at: string
        }
        Returns: Json
      }
      complete_money_setup: { Args: { p: Json }; Returns: Json }
      ensure_default_cash_account: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_account_statement: {
        Args: {
          p_account_id: string
          p_from?: string
          p_limit?: number
          p_to?: string
        }
        Returns: Json
      }
      get_big_games: { Args: never; Returns: Json }
      get_big_games_admin: { Args: never; Returns: Json }
      get_checkup: {
        Args: { p_period: string; p_today?: string }
        Returns: Json
      }
      get_checkup_status: { Args: { p_user_id: string }; Returns: Json }
      get_dashboard_metrics: {
        Args: { p_end?: string; p_start?: string; p_user_id: string }
        Returns: Json
      }
      get_expense_summary: {
        Args: { p_end?: string; p_start?: string; p_user_id: string }
        Returns: Json
      }
      get_hunt_list: { Args: never; Returns: Json }
      get_mileage_summary: {
        Args: { p_user_id: string; p_year: number }
        Returns: Json
      }
      get_period_series: {
        Args: {
          p_end?: string
          p_grain?: string
          p_start?: string
          p_user_id: string
        }
        Returns: {
          expenses: number
          period_start: string
          purchased: number
          revenue: number
          rolling_revenue: number
          sale_count: number
        }[]
      }
      get_reminders: {
        Args: { p_today?: string; p_user_id: string }
        Returns: Json
      }
      get_shop_cards: {
        Args: never
        Returns: {
          autograph: boolean
          brand: string
          card_number: string
          condition: string
          id: string
          in_bin: boolean
          listed_at: string
          offers_open: boolean
          parallel: string
          photo_back_url: string
          photo_front_url: string
          player_name: string
          price: number
          rookie: boolean
          serial_number: string
          set_name: string
          sport: string
          team: string
          year: string
        }[]
      }
      get_shop_promos: { Args: never; Returns: Json }
      get_tax_tracker: {
        Args: { p_today?: string; p_user_id: string }
        Returns: Json
      }
      get_todo: { Args: { p_today?: string; p_user_id: string }; Returns: Json }
      get_website_lists: { Args: never; Returns: Json }
      has_mentor_access: { Args: { _mentee_user_id: string }; Returns: boolean }
      last_sunday_of_month: { Args: { p_date: string }; Returns: string }
      mileage_rate_for: { Args: { p_date: string }; Returns: number }
      photo_convert_tick: { Args: never; Returns: number }
      photo_verify_tick: { Args: never; Returns: number }
      reassign_show_card_sale_to_show: {
        Args: {
          p_correction_note: string
          p_new_show_id: string
          p_transaction_id: string
        }
        Returns: undefined
      }
      record_account_transfer: {
        Args: {
          p_amount: number
          p_date: string
          p_from_account: string
          p_notes?: string
          p_to_account: string
        }
        Returns: string
      }
      record_reconciliation: {
        Args: {
          p_account_id: string
          p_as_of: string
          p_bank_balance: number
          p_note?: string
          p_post_adjustment?: boolean
          p_undeposited?: number
        }
        Returns: Json
      }
      record_tax_payment: {
        Args: {
          p_account_id: string
          p_amount: number
          p_authority: string
          p_date: string
          p_notes?: string
          p_period: string
        }
        Returns: string
      }
      soft_delete_sale: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: undefined
      }
      tax_estimate_schedule: {
        Args: { p_from: string; p_to: string }
        Returns: {
          due_date: string
          tax_period: string
        }[]
      }
      tax_quarter_paid: {
        Args: { p_period: string; p_user_id: string }
        Returns: boolean
      }
      todo_email_mark: {
        Args: {
          p_item_count: number
          p_kind: string
          p_period_key: string
          p_status: string
          p_user_id: string
        }
        Returns: boolean
      }
      todo_email_pending: {
        Args: { p_now?: string; p_user_id: string }
        Returns: Json
      }
      todo_email_tick: { Args: never; Returns: number }
      trip_prompts: {
        Args: {
          p_from?: string
          p_to?: string
          p_today: string
          p_user_id: string
        }
        Returns: {
          body: string
          destination: string
          event_date: string
          key: string
          kind: string
          lot_id: string
          purpose: string
          sell_lead_id: string
          show_id: string
          title: string
        }[]
      }
      web_addr_key: { Args: { a: Json }; Returns: string }
      web_apply_bin_deal: { Args: { p_order_id: string }; Returns: Json }
      web_apply_bonus_card: { Args: { p_order_id: string }; Returns: Json }
      web_apply_discount: {
        Args: { p_code: string; p_email: string; p_order_id: string }
        Returns: Json
      }
      web_apply_refund: {
        Args: {
          p_payment_intent: string
          p_refunded: number
          p_refunded_at: string
        }
        Returns: Json
      }
      web_apply_ship_link: {
        Args: { p_order_id: string; p_token: string }
        Returns: Json
      }
      web_auto_combine_shipping: { Args: { p_order_id: string }; Returns: Json }
      web_big_games_tick: { Args: never; Returns: number }
      web_check_discount: {
        Args: { p_code: string; p_email: string }
        Returns: Json
      }
      web_close_stack_link: {
        Args: { p_link_id: string; p_reopen?: boolean }
        Returns: undefined
      }
      web_complete_order: {
        Args: {
          p_buyer_email: string
          p_buyer_name: string
          p_order_id: string
          p_paid_at: string
          p_payment_intent: string
          p_shipping_address: Json
          p_stripe_fee: number
        }
        Returns: boolean
      }
      web_create_cart_order: {
        Args: {
          p_card_ids: string[]
          p_hold_minutes?: number
          p_offer_ids: string[]
        }
        Returns: {
          bonus_card: boolean
          buyer_email: string | null
          buyer_name: string | null
          created_at: string
          deal_discount: number
          discount: number
          discount_code: string | null
          emails_sent_at: string | null
          hold_expires_at: string
          id: string
          offer_id: string | null
          order_number: string
          paid_at: string | null
          problem_note: string | null
          refunded_amount: number
          refunded_at: string | null
          ship_link_id: string | null
          shipped_at: string | null
          shipping: number
          shipping_address: Json | null
          shipping_refund_id: string | null
          shipping_refunded: number | null
          source: string
          status: string
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "web_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_create_order: {
        Args: {
          p_card_ids: string[]
          p_hold_minutes?: number
          p_offer_id?: string
          p_prices?: Json
          p_source?: string
        }
        Returns: {
          bonus_card: boolean
          buyer_email: string | null
          buyer_name: string | null
          created_at: string
          deal_discount: number
          discount: number
          discount_code: string | null
          emails_sent_at: string | null
          hold_expires_at: string
          id: string
          offer_id: string | null
          order_number: string
          paid_at: string | null
          problem_note: string | null
          refunded_amount: number
          refunded_at: string | null
          ship_link_id: string | null
          shipped_at: string | null
          shipping: number
          shipping_address: Json | null
          shipping_refund_id: string | null
          shipping_refunded: number | null
          source: string
          status: string
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "web_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_create_sell_lead: {
        Args: {
          p_asking: number
          p_card_count: string
          p_categories: string[]
          p_details: string
          p_email: string
          p_era: string
          p_graded: string
          p_handoff: string
          p_heard_from?: string
          p_id: string
          p_ip_hash: string
          p_name: string
          p_phone: string
          p_photo_paths: string[]
          p_source_page: string
          p_zip: string
        }
        Returns: {
          asking_price: number | null
          card_count: string | null
          categories: string[]
          created_at: string
          details: string | null
          era: string | null
          graded: string | null
          handoff: string | null
          heard_from: string | null
          id: string
          ip_hash: string | null
          last_message: string | null
          lot_id: string | null
          offer_amount: number | null
          owner_notes: string | null
          photo_paths: string[]
          responded_at: string | null
          seller_email: string
          seller_name: string
          seller_phone: string | null
          source_page: string | null
          status: string
          updated_at: string
          user_id: string
          zip: string | null
        }
        SetofOptions: {
          from: "*"
          to: "web_sell_leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_create_stack_link: {
        Args: { p_email?: string; p_name: string; p_note?: string }
        Returns: {
          closed_at: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          expires_at: string | null
          id: string
          kind: string
          note: string | null
          order_id: string | null
          token: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "web_ship_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_extend_hold: {
        Args: { p_minutes: number; p_order_id: string }
        Returns: {
          bonus_card: boolean
          buyer_email: string | null
          buyer_name: string | null
          created_at: string
          deal_discount: number
          discount: number
          discount_code: string | null
          emails_sent_at: string | null
          hold_expires_at: string
          id: string
          offer_id: string | null
          order_number: string
          paid_at: string | null
          problem_note: string | null
          refunded_amount: number
          refunded_at: string | null
          ship_link_id: string | null
          shipped_at: string | null
          shipping: number
          shipping_address: Json | null
          shipping_refund_id: string | null
          shipping_refunded: number | null
          source: string
          status: string
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "web_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_hide_big_game: {
        Args: { p_hidden?: boolean; p_id: number }
        Returns: undefined
      }
      web_hold_for_offer: {
        Args: { p_offer_id: string }
        Returns: {
          bonus_card: boolean
          buyer_email: string | null
          buyer_name: string | null
          created_at: string
          deal_discount: number
          discount: number
          discount_code: string | null
          emails_sent_at: string | null
          hold_expires_at: string
          id: string
          offer_id: string | null
          order_number: string
          paid_at: string | null
          problem_note: string | null
          refunded_amount: number
          refunded_at: string | null
          ship_link_id: string | null
          shipped_at: string | null
          shipping: number
          shipping_address: Json | null
          shipping_refund_id: string | null
          shipping_refunded: number | null
          source: string
          status: string
          stripe_fee: number | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal: number
          total: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "web_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_make_offer: {
        Args: {
          p_action_token: string
          p_amount: number
          p_buyer_email: string
          p_buyer_name: string
          p_card_id: string
          p_ip_hash?: string
          p_note: string
          p_pay_token: string
        }
        Returns: {
          action_token: string
          amount: number
          asking_at_offer: number
          auto_accepted: boolean
          buyer_email: string
          buyer_ip_hash: string | null
          buyer_name: string
          buyer_note: string | null
          counter_amount: number | null
          created_at: string
          final_amount: number | null
          floor_at_offer: number
          id: string
          order_id: string | null
          pay_expires_at: string | null
          pay_token: string | null
          responded_at: string | null
          show_card_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "web_offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_name_key: { Args: { p: string }; Returns: string }
      web_new_link_token: { Args: never; Returns: string }
      web_order_ship_link: { Args: { p_order_id: string }; Returns: Json }
      web_owner_release_hold: {
        Args: { p_card_id: string; p_user_id: string }
        Returns: Json
      }
      web_refund_candidates: {
        Args: never
        Returns: {
          accounted: number
          charged: number
          order_number: string
          payment_intent: string
        }[]
      }
      web_refund_sync_tick: { Args: never; Returns: number }
      web_release_order: {
        Args: { p_order_id: string; p_status?: string }
        Returns: undefined
      }
      web_release_stale_holds: { Args: never; Returns: number }
      web_repeat_code: { Args: { p_user_id: string }; Returns: Json }
      web_respond_offer: {
        Args: {
          p_action: string
          p_counter?: number
          p_offer_id: string
          p_pay_token?: string
        }
        Returns: {
          action_token: string
          amount: number
          asking_at_offer: number
          auto_accepted: boolean
          buyer_email: string
          buyer_ip_hash: string | null
          buyer_name: string
          buyer_note: string | null
          counter_amount: number | null
          created_at: string
          final_amount: number | null
          floor_at_offer: number
          id: string
          order_id: string | null
          pay_expires_at: string | null
          pay_token: string | null
          responded_at: string | null
          show_card_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "web_offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_restore_offer_holds: { Args: { p_order_id: string }; Returns: number }
      web_sell_lead_link_lot: {
        Args: { p_lead_id: string; p_lot_id: string }
        Returns: {
          asking_price: number | null
          card_count: string | null
          categories: string[]
          created_at: string
          details: string | null
          era: string | null
          graded: string | null
          handoff: string | null
          heard_from: string | null
          id: string
          ip_hash: string | null
          last_message: string | null
          lot_id: string | null
          offer_amount: number | null
          owner_notes: string | null
          photo_paths: string[]
          responded_at: string | null
          seller_email: string
          seller_name: string
          seller_phone: string | null
          source_page: string | null
          status: string
          updated_at: string
          user_id: string
          zip: string | null
        }
        SetofOptions: {
          from: "*"
          to: "web_sell_leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_sell_lead_record_reply: {
        Args: {
          p_lead_id: string
          p_message: string
          p_offer: number
          p_owner: string
          p_status: string
        }
        Returns: {
          asking_price: number | null
          card_count: string | null
          categories: string[]
          created_at: string
          details: string | null
          era: string | null
          graded: string | null
          handoff: string | null
          heard_from: string | null
          id: string
          ip_hash: string | null
          last_message: string | null
          lot_id: string | null
          offer_amount: number | null
          owner_notes: string | null
          photo_paths: string[]
          responded_at: string | null
          seller_email: string
          seller_name: string
          seller_phone: string | null
          source_page: string | null
          status: string
          updated_at: string
          user_id: string
          zip: string | null
        }
        SetofOptions: {
          from: "*"
          to: "web_sell_leads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      web_set_stripe_fee: {
        Args: { p_fee: number; p_payment_intent: string }
        Returns: boolean
      }
      web_ship_link_info: { Args: { p_token: string }; Returns: Json }
      web_ship_link_valid: {
        Args: { p_token: string }
        Returns: {
          closed_at: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          expires_at: string | null
          id: string
          kind: string
          note: string | null
          order_id: string | null
          token: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "web_ship_links"
          isOneToOne: true
          isSetofReturn: false
        }
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
