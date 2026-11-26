/**
 * Database types generated from supabase/migrations/0001..0061.
 * Can be refreshed from a hosted project via:
 *   npx supabase gen types typescript --project-id <ref> > types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: unknown } | unknown[];

export interface Database {
  public: {
    Tables: {
      account_provisioning_events: {
        Row: {
          id: number;
          request_id: string;
          from_status: string | null;
          to_status: string;
          attempt: number;
          code: string | null;
          message: string | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          request_id: string;
          from_status?: string | null;
          to_status: string;
          attempt?: number;
          code?: string | null;
          message?: string | null;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          request_id?: string;
          from_status?: string | null;
          to_status?: string;
          attempt?: number;
          code?: string | null;
          message?: string | null;
          actor_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'account_provisioning_events_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'account_provisioning_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      account_provisioning_requests: {
        Row: {
          id: string;
          actor_id: string;
          actor_type: string;
          request_key: string;
          store_id: string;
          email: string;
          full_name: string;
          phone: string | null;
          role: string;
          permissions: string[];
          onboarding_id: string | null;
          profile_id: string | null;
          status: string;
          attempt_count: number;
          claim_token: string | null;
          claimed_until: string | null;
          failure_code: string | null;
          failure_message: string | null;
          reconciliation_reason: string | null;
          reconciliation_note: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          actor_id: string;
          actor_type: string;
          request_key: string;
          store_id: string;
          email: string;
          full_name: string;
          phone?: string | null;
          role: string;
          permissions?: string[];
          onboarding_id?: string | null;
          profile_id?: string | null;
          status?: string;
          attempt_count?: number;
          claim_token?: string | null;
          claimed_until?: string | null;
          failure_code?: string | null;
          failure_message?: string | null;
          reconciliation_reason?: string | null;
          reconciliation_note?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          actor_id?: string;
          actor_type?: string;
          request_key?: string;
          store_id?: string;
          email?: string;
          full_name?: string;
          phone?: string | null;
          role?: string;
          permissions?: string[];
          onboarding_id?: string | null;
          profile_id?: string | null;
          status?: string;
          attempt_count?: number;
          claim_token?: string | null;
          claimed_until?: string | null;
          failure_code?: string | null;
          failure_message?: string | null;
          reconciliation_reason?: string | null;
          reconciliation_note?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'account_provisioning_requests_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'account_provisioning_requests_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'account_provisioning_requests_onboarding_id_fkey';
            columns: ['onboarding_id'];
            isOneToOne: false;
            referencedRelation: 'store_onboardings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'account_provisioning_requests_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      addresses: {
        Row: {
          id: string;
          store_id: string;
          customer_id: string;
          line1: string;
          line2: string | null;
          city: string;
          state: string;
          pincode: string;
          is_default: boolean;
        };
        Insert: {
          id?: string;
          store_id: string;
          customer_id: string;
          line1: string;
          line2?: string | null;
          city: string;
          state: string;
          pincode: string;
          is_default?: boolean;
        };
        Update: {
          id?: string;
          store_id?: string;
          customer_id?: string;
          line1?: string;
          line2?: string | null;
          city?: string;
          state?: string;
          pincode?: string;
          is_default?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'addresses_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'addresses_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          store_id: string | null;
          actor_id: string | null;
          actor_type: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before_state: Json | null;
          after_state: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id?: string | null;
          actor_id?: string | null;
          actor_type: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string | null;
          actor_id?: string | null;
          actor_type?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      brands: {
        Row: {
          id: string;
          store_id: string;
          slug: string;
          name: string;
          logo_url: string | null;
          is_premium: boolean;
          created_at: string;
          logo_path: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          slug: string;
          name: string;
          logo_url?: string | null;
          is_premium?: boolean;
          created_at?: string;
          logo_path?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          slug?: string;
          name?: string;
          logo_url?: string | null;
          is_premium?: boolean;
          created_at?: string;
          logo_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'brands_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          store_id: string;
          variant_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          cart_id: string;
          store_id: string;
          variant_id: string;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          cart_id?: string;
          store_id?: string;
          variant_id?: string;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cart_items_cart_id_fkey';
            columns: ['cart_id'];
            isOneToOne: false;
            referencedRelation: 'carts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cart_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cart_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      carts: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string;
          status: string;
          coupon_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id: string;
          status?: string;
          coupon_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string;
          status?: string;
          coupon_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'carts_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'carts_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      cash_confirmations: {
        Row: {
          id: string;
          store_id: string;
          order_id: string;
          payment_id: string;
          amount_due_paise: number;
          amount_received_paise: number;
          confirmed_by: string;
          confirmed_at: string;
          note: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id: string;
          payment_id: string;
          amount_due_paise: number;
          amount_received_paise: number;
          confirmed_by: string;
          confirmed_at?: string;
          note?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_id?: string;
          payment_id?: string;
          amount_due_paise?: number;
          amount_received_paise?: number;
          confirmed_by?: string;
          confirmed_at?: string;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_confirmations_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_confirmations_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_confirmations_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_confirmations_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cash_movements: {
        Row: {
          id: string;
          store_id: string;
          business_date: string;
          movement_type: string;
          amount_paise: number;
          reason: string;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          business_date: string;
          movement_type: string;
          amount_paise: number;
          reason: string;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          business_date?: string;
          movement_type?: string;
          amount_paise?: number;
          reason?: string;
          actor_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_movements_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_movements_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cash_reconciliations: {
        Row: {
          id: string;
          store_id: string;
          business_date: string;
          opening_paise: number;
          cash_sales_paise: number;
          cash_refunds_paise: number;
          cash_expenses_paise: number;
          cash_deposits_paise: number;
          expected_closing_paise: number;
          actual_closing_paise: number;
          difference_paise: number;
          closed_by: string | null;
          created_at: string;
          cash_manual_in_paise: number;
          cash_withdrawals_paise: number;
          cash_manual_out_paise: number;
        };
        Insert: {
          id?: string;
          store_id: string;
          business_date: string;
          opening_paise?: number;
          cash_sales_paise?: number;
          cash_refunds_paise?: number;
          cash_expenses_paise?: number;
          cash_deposits_paise?: number;
          expected_closing_paise: number;
          actual_closing_paise: number;
          difference_paise: number;
          closed_by?: string | null;
          created_at?: string;
          cash_manual_in_paise?: number;
          cash_withdrawals_paise?: number;
          cash_manual_out_paise?: number;
        };
        Update: {
          id?: string;
          store_id?: string;
          business_date?: string;
          opening_paise?: number;
          cash_sales_paise?: number;
          cash_refunds_paise?: number;
          cash_expenses_paise?: number;
          cash_deposits_paise?: number;
          expected_closing_paise?: number;
          actual_closing_paise?: number;
          difference_paise?: number;
          closed_by?: string | null;
          created_at?: string;
          cash_manual_in_paise?: number;
          cash_withdrawals_paise?: number;
          cash_manual_out_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_reconciliations_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_reconciliations_closed_by_fkey';
            columns: ['closed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          store_id: string;
          slug: string;
          name: string;
          image_url: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          image_path: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          slug: string;
          name: string;
          image_url?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          image_path?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          slug?: string;
          name?: string;
          image_url?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          image_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      coupon_redemptions: {
        Row: {
          id: string;
          store_id: string;
          coupon_id: string;
          order_id: string;
          discount_paise: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          coupon_id: string;
          order_id: string;
          discount_paise: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          coupon_id?: string;
          order_id?: string;
          discount_paise?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'coupon_redemptions_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coupon_redemptions_coupon_id_fkey';
            columns: ['coupon_id'];
            isOneToOne: false;
            referencedRelation: 'coupons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coupon_redemptions_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      coupons: {
        Row: {
          id: string;
          store_id: string;
          code: string;
          discount_type: string;
          discount_bps: number | null;
          discount_paise: number | null;
          min_order_paise: number;
          max_uses: number | null;
          used_count: number;
          starts_at: string | null;
          ends_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          code: string;
          discount_type: string;
          discount_bps?: number | null;
          discount_paise?: number | null;
          min_order_paise?: number;
          max_uses?: number | null;
          used_count?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          code?: string;
          discount_type?: string;
          discount_bps?: number | null;
          discount_paise?: number | null;
          min_order_paise?: number;
          max_uses?: number | null;
          used_count?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'coupons_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_ledger: {
        Row: {
          id: string;
          store_id: string;
          customer_id: string;
          entry_type: string;
          amount_paise: number;
          due_on: string | null;
          reference_type: string | null;
          reference_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          customer_id: string;
          entry_type: string;
          amount_paise: number;
          due_on?: string | null;
          reference_type?: string | null;
          reference_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          customer_id?: string;
          entry_type?: string;
          amount_paise?: number;
          due_on?: string | null;
          reference_type?: string | null;
          reference_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_ledger_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_ledger_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          store_id: string;
          full_name: string;
          mobile: string | null;
          email: string | null;
          gstin: string | null;
          is_credit_approved: boolean;
          credit_limit_paise: number;
          lifetime_value_paise: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          full_name: string;
          mobile?: string | null;
          email?: string | null;
          gstin?: string | null;
          is_credit_approved?: boolean;
          credit_limit_paise?: number;
          lifetime_value_paise?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          full_name?: string;
          mobile?: string | null;
          email?: string | null;
          gstin?: string | null;
          is_credit_approved?: boolean;
          credit_limit_paise?: number;
          lifetime_value_paise?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      damaged_stock: {
        Row: {
          id: string;
          store_id: string;
          variant_id: string;
          batch_id: string | null;
          quantity: number;
          reason: string;
          reported_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          variant_id: string;
          batch_id?: string | null;
          quantity: number;
          reason: string;
          reported_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          variant_id?: string;
          batch_id?: string | null;
          quantity?: number;
          reason?: string;
          reported_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'damaged_stock_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'damaged_stock_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'damaged_stock_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'damaged_stock_reported_by_fkey';
            columns: ['reported_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      deliveries: {
        Row: {
          id: string;
          store_id: string;
          order_id: string;
          status: string;
          scheduled_on: string | null;
          delivery_charge_paise: number;
          assigned_to: string | null;
          vehicle_number: string | null;
          delivered_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id: string;
          status?: string;
          scheduled_on?: string | null;
          delivery_charge_paise?: number;
          assigned_to?: string | null;
          vehicle_number?: string | null;
          delivered_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_id?: string;
          status?: string;
          scheduled_on?: string | null;
          delivery_charge_paise?: number;
          assigned_to?: string | null;
          vehicle_number?: string | null;
          delivered_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'deliveries_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'deliveries_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      discounts: {
        Row: {
          id: string;
          store_id: string;
          scope: string;
          target_id: string | null;
          discount_bps: number;
          min_quantity: number | null;
          starts_at: string | null;
          ends_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          scope: string;
          target_id?: string | null;
          discount_bps: number;
          min_quantity?: number | null;
          starts_at?: string | null;
          ends_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          scope?: string;
          target_id?: string | null;
          discount_bps?: number;
          min_quantity?: number | null;
          starts_at?: string | null;
          ends_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'discounts_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          store_id: string;
          category: string;
          amount_paise: number;
          expense_on: string;
          paid_from: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          category: string;
          amount_paise: number;
          expense_on?: string;
          paid_from?: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          category?: string;
          amount_paise?: number;
          expense_on?: string;
          paid_from?: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      feature_flags: {
        Row: {
          store_id: string;
          feature_key: string;
          enabled: boolean;
          updated_at: string;
        };
        Insert: {
          store_id: string;
          feature_key: string;
          enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          store_id?: string;
          feature_key?: string;
          enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'feature_flags_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      goods_receipt_items: {
        Row: {
          id: string;
          goods_receipt_id: string;
          store_id: string;
          purchase_order_item_id: string | null;
          variant_id: string;
          batch_number: string | null;
          quantity_received: number;
          quantity_damaged: number;
          unit_cost_paise: number;
        };
        Insert: {
          id?: string;
          goods_receipt_id: string;
          store_id: string;
          purchase_order_item_id?: string | null;
          variant_id: string;
          batch_number?: string | null;
          quantity_received: number;
          quantity_damaged?: number;
          unit_cost_paise: number;
        };
        Update: {
          id?: string;
          goods_receipt_id?: string;
          store_id?: string;
          purchase_order_item_id?: string | null;
          variant_id?: string;
          batch_number?: string | null;
          quantity_received?: number;
          quantity_damaged?: number;
          unit_cost_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'goods_receipt_items_goods_receipt_id_fkey';
            columns: ['goods_receipt_id'];
            isOneToOne: false;
            referencedRelation: 'goods_receipts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipt_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipt_items_purchase_order_item_id_fkey';
            columns: ['purchase_order_item_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_order_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipt_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      goods_receipts: {
        Row: {
          id: string;
          store_id: string;
          purchase_order_id: string | null;
          supplier_id: string;
          grn_number: string;
          received_on: string;
          received_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          purchase_order_id?: string | null;
          supplier_id: string;
          grn_number: string;
          received_on?: string;
          received_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          purchase_order_id?: string | null;
          supplier_id?: string;
          grn_number?: string;
          received_on?: string;
          received_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goods_receipts_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipts_purchase_order_id_fkey';
            columns: ['purchase_order_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipts_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goods_receipts_received_by_fkey';
            columns: ['received_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      gst_state_codes: {
        Row: {
          code: string;
          name: string;
          tax_regime: string;
        };
        Insert: {
          code: string;
          name: string;
          tax_regime: string;
        };
        Update: {
          code?: string;
          name?: string;
          tax_regime?: string;
        };
        Relationships: [];
      };
      guest_checkout_requests: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string;
          request_key: string;
          request_hash: string;
          status: string;
          order_id: string | null;
          result: Json | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id: string;
          request_key: string;
          request_hash: string;
          status: string;
          order_id?: string | null;
          result?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string;
          request_key?: string;
          request_hash?: string;
          status?: string;
          order_id?: string | null;
          result?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_checkout_requests_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_checkout_requests_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_checkout_requests_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_compare_items: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string;
          product_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id: string;
          product_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string;
          product_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_compare_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_compare_items_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_compare_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_request_keys: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string;
          kind: string;
          request_key: string;
          status: string;
          result: Json | null;
          created_at: string;
          completed_at: string | null;
          attempt: number;
          lease_expires_at: string | null;
          progress: Json;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id: string;
          kind: string;
          request_key: string;
          status?: string;
          result?: Json | null;
          created_at?: string;
          completed_at?: string | null;
          attempt?: number;
          lease_expires_at?: string | null;
          progress?: Json;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string;
          kind?: string;
          request_key?: string;
          status?: string;
          result?: Json | null;
          created_at?: string;
          completed_at?: string | null;
          attempt?: number;
          lease_expires_at?: string | null;
          progress?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_request_keys_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_request_keys_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_request_steps: {
        Row: {
          request_id: string;
          step_index: number;
          status: string;
          variant_id: string;
          quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          request_id: string;
          step_index: number;
          status: string;
          variant_id: string;
          quantity: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          request_id?: string;
          step_index?: number;
          status?: string;
          variant_id?: string;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_request_steps_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'guest_request_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_request_steps_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_room_photos: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string;
          upload_id: string;
          label: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id: string;
          upload_id: string;
          label?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string;
          upload_id?: string;
          label?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_room_photos_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_room_photos_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_room_photos_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: true;
            referencedRelation: 'storage_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_sessions: {
        Row: {
          id: string;
          store_id: string;
          token_hash: string;
          customer_id: string | null;
          created_at: string;
          last_seen_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          token_hash: string;
          customer_id?: string | null;
          created_at?: string;
          last_seen_at?: string;
          expires_at: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          token_hash?: string;
          customer_id?: string | null;
          created_at?: string;
          last_seen_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_sessions_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_sessions_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_wishlist_items: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string;
          product_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id: string;
          product_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string;
          product_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_wishlist_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_wishlist_items_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_wishlist_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      house_project_items: {
        Row: {
          id: string;
          store_id: string;
          project_id: string;
          room_id: string | null;
          variant_id: string;
          quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          project_id: string;
          room_id?: string | null;
          variant_id: string;
          quantity: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          project_id?: string;
          room_id?: string | null;
          variant_id?: string;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'house_project_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'house_project_items_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'house_projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'house_project_items_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'house_project_rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'house_project_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      house_project_rooms: {
        Row: {
          id: string;
          store_id: string;
          project_id: string;
          room_type: string;
          name: string;
          length_value: number | null;
          width_value: number | null;
          height_value: number | null;
          measure_unit: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          project_id: string;
          room_type: string;
          name: string;
          length_value?: number | null;
          width_value?: number | null;
          height_value?: number | null;
          measure_unit?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          project_id?: string;
          room_type?: string;
          name?: string;
          length_value?: number | null;
          width_value?: number | null;
          height_value?: number | null;
          measure_unit?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'house_project_rooms_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'house_project_rooms_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'house_projects';
            referencedColumns: ['id'];
          },
        ];
      };
      house_projects: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string;
          name: string;
          description: string | null;
          project_type: string;
          budget_paise: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id: string;
          name: string;
          description?: string | null;
          project_type?: string;
          budget_paise?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string;
          name?: string;
          description?: string | null;
          project_type?: string;
          budget_paise?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'house_projects_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'house_projects_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory: {
        Row: {
          id: string;
          store_id: string;
          variant_id: string;
          on_hand: number;
          reserved: number;
          damaged: number;
          incoming: number;
          reorder_level: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          variant_id: string;
          on_hand?: number;
          reserved?: number;
          damaged?: number;
          incoming?: number;
          reorder_level?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          variant_id?: string;
          on_hand?: number;
          reserved?: number;
          damaged?: number;
          incoming?: number;
          reorder_level?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: true;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_batches: {
        Row: {
          id: string;
          store_id: string;
          variant_id: string;
          supplier_id: string | null;
          batch_number: string;
          shade_code: string | null;
          calibre: string | null;
          manufacturing_date: string | null;
          on_hand: number;
          reserved: number;
          damaged: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          variant_id: string;
          supplier_id?: string | null;
          batch_number: string;
          shade_code?: string | null;
          calibre?: string | null;
          manufacturing_date?: string | null;
          on_hand?: number;
          reserved?: number;
          damaged?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          variant_id?: string;
          supplier_id?: string | null;
          batch_number?: string;
          shade_code?: string | null;
          calibre?: string | null;
          manufacturing_date?: string | null;
          on_hand?: number;
          reserved?: number;
          damaged?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_batches_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_batches_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_batches_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_reservations: {
        Row: {
          id: string;
          store_id: string;
          order_id: string;
          variant_id: string;
          quantity: number;
          status: string;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id: string;
          variant_id: string;
          quantity: number;
          status?: string;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_id?: string;
          variant_id?: string;
          quantity?: number;
          status?: string;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_reservations_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_reservations_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_reservations_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          store_id: string;
          order_id: string;
          invoice_number: string;
          invoice_date: string;
          taxable_paise: number;
          tax_paise: number;
          total_paise: number;
          pdf_path: string | null;
          created_at: string;
          seller_legal_name: string | null;
          seller_billing_address: string | null;
          seller_gstin: string | null;
          seller_state: string | null;
          seller_gst_registration: string | null;
          seller_prices_include_gst: boolean | null;
          seller_snapshot_basis: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id: string;
          invoice_number: string;
          invoice_date?: string;
          taxable_paise: number;
          tax_paise: number;
          total_paise: number;
          pdf_path?: string | null;
          created_at?: string;
          seller_legal_name?: string | null;
          seller_billing_address?: string | null;
          seller_gstin?: string | null;
          seller_state?: string | null;
          seller_gst_registration?: string | null;
          seller_prices_include_gst?: boolean | null;
          seller_snapshot_basis?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_id?: string;
          invoice_number?: string;
          invoice_date?: string;
          taxable_paise?: number;
          tax_paise?: number;
          total_paise?: number;
          pdf_path?: string | null;
          created_at?: string;
          seller_legal_name?: string | null;
          seller_billing_address?: string | null;
          seller_gstin?: string | null;
          seller_state?: string | null;
          seller_gst_registration?: string | null;
          seller_prices_include_gst?: boolean | null;
          seller_snapshot_basis?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invoices_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      late_payments: {
        Row: {
          id: string;
          store_id: string | null;
          order_id: string | null;
          provider: string;
          provider_order_id: string | null;
          provider_payment_id: string;
          amount_paise: number;
          currency: string;
          reason: string;
          status: string;
          resolution_note: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          refund_id: string | null;
        };
        Insert: {
          id?: string;
          store_id?: string | null;
          order_id?: string | null;
          provider: string;
          provider_order_id?: string | null;
          provider_payment_id: string;
          amount_paise: number;
          currency?: string;
          reason: string;
          status?: string;
          resolution_note?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          refund_id?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string | null;
          order_id?: string | null;
          provider?: string;
          provider_order_id?: string | null;
          provider_payment_id?: string;
          amount_paise?: number;
          currency?: string;
          reason?: string;
          status?: string;
          resolution_note?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          refund_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'late_payments_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'late_payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'late_payments_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'late_payments_refund_id_fkey';
            columns: ['refund_id'];
            isOneToOne: true;
            referencedRelation: 'refunds';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          store_id: string | null;
          recipient_profile_id: string | null;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id?: string | null;
          recipient_profile_id?: string | null;
          type: string;
          title: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string | null;
          recipient_profile_id?: string | null;
          type?: string;
          title?: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_recipient_profile_id_fkey';
            columns: ['recipient_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          store_id: string;
          variant_id: string;
          product_name_snapshot: string;
          variant_label_snapshot: string;
          sku_snapshot: string;
          hsn_code_snapshot: string | null;
          quantity: number;
          stock_units: number;
          cost_price_paise_snapshot: number;
          unit_price_paise: number;
          discount_paise: number;
          gst_rate_bps: number;
          taxable_paise: number;
          tax_paise: number;
          line_total_paise: number;
          cgst_paise: number;
          sgst_paise: number;
          utgst_paise: number;
          igst_paise: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          store_id: string;
          variant_id: string;
          product_name_snapshot: string;
          variant_label_snapshot: string;
          sku_snapshot: string;
          hsn_code_snapshot?: string | null;
          quantity: number;
          stock_units: number;
          cost_price_paise_snapshot?: number;
          unit_price_paise: number;
          discount_paise?: number;
          gst_rate_bps: number;
          taxable_paise: number;
          tax_paise: number;
          line_total_paise: number;
          cgst_paise?: number;
          sgst_paise?: number;
          utgst_paise?: number;
          igst_paise?: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          store_id?: string;
          variant_id?: string;
          product_name_snapshot?: string;
          variant_label_snapshot?: string;
          sku_snapshot?: string;
          hsn_code_snapshot?: string | null;
          quantity?: number;
          stock_units?: number;
          cost_price_paise_snapshot?: number;
          unit_price_paise?: number;
          discount_paise?: number;
          gst_rate_bps?: number;
          taxable_paise?: number;
          tax_paise?: number;
          line_total_paise?: number;
          cgst_paise?: number;
          sgst_paise?: number;
          utgst_paise?: number;
          igst_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          store_id: string;
          from_status: string | null;
          to_status: string;
          actor_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          store_id: string;
          from_status?: string | null;
          to_status: string;
          actor_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          store_id?: string;
          from_status?: string | null;
          to_status?: string;
          actor_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_status_history_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_status_history_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_status_history_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          store_id: string;
          order_number: string;
          channel: string;
          guest_session_id: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_mobile: string | null;
          customer_email: string | null;
          fulfilment: string;
          delivery_address: Json | null;
          payment_method: string;
          payment_status: string;
          order_status: string;
          subtotal_paise: number;
          discount_paise: number;
          taxable_paise: number;
          tax_paise: number;
          delivery_paise: number;
          total_paise: number;
          coupon_code: string | null;
          access_token_hash: string | null;
          reservation_expires_at: string | null;
          paid_at: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string;
          quotation_id: string | null;
          supply_state_code: string | null;
          store_state_code: string | null;
          tax_mode: string | null;
          is_interstate: boolean | null;
          cgst_paise: number;
          sgst_paise: number;
          utgst_paise: number;
          igst_paise: number;
          gst_registration_snapshot: string | null;
          gross_subtotal_paise: number | null;
          gross_discount_paise: number | null;
          customer_gstin: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_number: string;
          channel?: string;
          guest_session_id?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_mobile?: string | null;
          customer_email?: string | null;
          fulfilment?: string;
          delivery_address?: Json | null;
          payment_method: string;
          payment_status?: string;
          order_status?: string;
          subtotal_paise: number;
          discount_paise?: number;
          taxable_paise: number;
          tax_paise: number;
          delivery_paise?: number;
          total_paise: number;
          coupon_code?: string | null;
          access_token_hash?: string | null;
          reservation_expires_at?: string | null;
          paid_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          quotation_id?: string | null;
          supply_state_code?: string | null;
          store_state_code?: string | null;
          tax_mode?: string | null;
          is_interstate?: boolean | null;
          cgst_paise?: number;
          sgst_paise?: number;
          utgst_paise?: number;
          igst_paise?: number;
          gst_registration_snapshot?: string | null;
          gross_subtotal_paise?: number | null;
          gross_discount_paise?: number | null;
          customer_gstin?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_number?: string;
          channel?: string;
          guest_session_id?: string | null;
          customer_id?: string | null;
          customer_name?: string;
          customer_mobile?: string | null;
          customer_email?: string | null;
          fulfilment?: string;
          delivery_address?: Json | null;
          payment_method?: string;
          payment_status?: string;
          order_status?: string;
          subtotal_paise?: number;
          discount_paise?: number;
          taxable_paise?: number;
          tax_paise?: number;
          delivery_paise?: number;
          total_paise?: number;
          coupon_code?: string | null;
          access_token_hash?: string | null;
          reservation_expires_at?: string | null;
          paid_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          quotation_id?: string | null;
          supply_state_code?: string | null;
          store_state_code?: string | null;
          tax_mode?: string | null;
          is_interstate?: boolean | null;
          cgst_paise?: number;
          sgst_paise?: number;
          utgst_paise?: number;
          igst_paise?: number;
          gst_registration_snapshot?: string | null;
          gross_subtotal_paise?: number | null;
          gross_discount_paise?: number | null;
          customer_gstin?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_quotation_id_fkey';
            columns: ['quotation_id'];
            isOneToOne: false;
            referencedRelation: 'quotations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_supply_state_code_fkey';
            columns: ['supply_state_code'];
            isOneToOne: false;
            referencedRelation: 'gst_state_codes';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'orders_store_state_code_fkey';
            columns: ['store_state_code'];
            isOneToOne: false;
            referencedRelation: 'gst_state_codes';
            referencedColumns: ['code'];
          },
        ];
      };
      payment_events: {
        Row: {
          id: string;
          store_id: string | null;
          provider: string;
          provider_event_id: string;
          event_type: string;
          payload: Json;
          signature_valid: boolean;
          received_at: string;
          processed_at: string | null;
          status: string;
          attempts: number;
          lease_until: string | null;
          last_error: string | null;
        };
        Insert: {
          id?: string;
          store_id?: string | null;
          provider: string;
          provider_event_id: string;
          event_type: string;
          payload: Json;
          signature_valid?: boolean;
          received_at?: string;
          processed_at?: string | null;
          status?: string;
          attempts?: number;
          lease_until?: string | null;
          last_error?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string | null;
          provider?: string;
          provider_event_id?: string;
          event_type?: string;
          payload?: Json;
          signature_valid?: boolean;
          received_at?: string;
          processed_at?: string | null;
          status?: string;
          attempts?: number;
          lease_until?: string | null;
          last_error?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_events_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_initialisation_attempts: {
        Row: {
          id: string;
          init_id: string;
          attempt_no: number;
          outcome: string;
          safe_detail: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          init_id: string;
          attempt_no: number;
          outcome: string;
          safe_detail?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          init_id?: string;
          attempt_no?: number;
          outcome?: string;
          safe_detail?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_initialisation_attempts_init_id_fkey';
            columns: ['init_id'];
            isOneToOne: false;
            referencedRelation: 'payment_initialisations';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_initialisations: {
        Row: {
          id: string;
          store_id: string;
          order_id: string;
          provider: string;
          expected_amount_paise: number;
          currency: string;
          status: string;
          provider_order_id: string | null;
          attempts: number;
          lease_until: string | null;
          safe_error: string | null;
          reconciliation_status: string;
          reconciled_by: string | null;
          reconciled_at: string | null;
          reconciliation_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id: string;
          provider: string;
          expected_amount_paise: number;
          currency?: string;
          status: string;
          provider_order_id?: string | null;
          attempts?: number;
          lease_until?: string | null;
          safe_error?: string | null;
          reconciliation_status?: string;
          reconciled_by?: string | null;
          reconciled_at?: string | null;
          reconciliation_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_id?: string;
          provider?: string;
          expected_amount_paise?: number;
          currency?: string;
          status?: string;
          provider_order_id?: string | null;
          attempts?: number;
          lease_until?: string | null;
          safe_error?: string | null;
          reconciliation_status?: string;
          reconciled_by?: string | null;
          reconciled_at?: string | null;
          reconciliation_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_initialisations_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_initialisations_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_initialisations_reconciled_by_fkey';
            columns: ['reconciled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          store_id: string;
          order_id: string;
          method: string;
          provider: string;
          provider_order_id: string | null;
          provider_payment_id: string | null;
          status: string;
          amount_paise: number;
          currency: string;
          upi_qr_payload: string | null;
          expires_at: string | null;
          paid_at: string | null;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id: string;
          method: string;
          provider: string;
          provider_order_id?: string | null;
          provider_payment_id?: string | null;
          status: string;
          amount_paise: number;
          currency?: string;
          upi_qr_payload?: string | null;
          expires_at?: string | null;
          paid_at?: string | null;
          failure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_id?: string;
          method?: string;
          provider?: string;
          provider_order_id?: string | null;
          provider_payment_id?: string | null;
          status?: string;
          amount_paise?: number;
          currency?: string;
          upi_qr_payload?: string | null;
          expires_at?: string | null;
          paid_at?: string | null;
          failure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: {
          code: string;
          description: string;
        };
        Insert: {
          code: string;
          description: string;
        };
        Update: {
          code?: string;
          description?: string;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          profile_id: string;
          created_at: string;
        };
        Insert: {
          profile_id: string;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_admins_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value?: Json;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      pos_bill_items: {
        Row: {
          id: string;
          bill_id: string;
          store_id: string;
          variant_id: string;
          quantity: number;
          line_discount_paise: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          bill_id: string;
          store_id: string;
          variant_id: string;
          quantity: number;
          line_discount_paise?: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          bill_id?: string;
          store_id?: string;
          variant_id?: string;
          quantity?: number;
          line_discount_paise?: number;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'pos_bill_items_bill_id_fkey';
            columns: ['bill_id'];
            isOneToOne: false;
            referencedRelation: 'pos_bills';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pos_bill_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pos_bill_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      pos_bills: {
        Row: {
          id: string;
          store_id: string;
          bill_reference: string;
          status: string;
          customer_id: string | null;
          note: string | null;
          order_id: string | null;
          created_by: string | null;
          completed_by: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string;
          coupon_id: string | null;
          fulfilment_mode: string;
          delivery_state_code: string | null;
          buyer_gstin: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          bill_reference: string;
          status?: string;
          customer_id?: string | null;
          note?: string | null;
          order_id?: string | null;
          created_by?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          coupon_id?: string | null;
          fulfilment_mode?: string;
          delivery_state_code?: string | null;
          buyer_gstin?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          bill_reference?: string;
          status?: string;
          customer_id?: string | null;
          note?: string | null;
          order_id?: string | null;
          created_by?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          coupon_id?: string | null;
          fulfilment_mode?: string;
          delivery_state_code?: string | null;
          buyer_gstin?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pos_bills_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pos_bills_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pos_bills_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pos_bills_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pos_bills_completed_by_fkey';
            columns: ['completed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pos_bills_coupon_id_fkey';
            columns: ['coupon_id'];
            isOneToOne: false;
            referencedRelation: 'coupons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pos_bills_delivery_state_code_fkey';
            columns: ['delivery_state_code'];
            isOneToOne: false;
            referencedRelation: 'gst_state_codes';
            referencedColumns: ['code'];
          },
        ];
      };
      product_images: {
        Row: {
          id: string;
          store_id: string;
          product_id: string;
          storage_path: string | null;
          public_url: string;
          alt_text: string;
          sort_order: number;
          is_primary: boolean;
          created_at: string;
          storage_bucket: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: string;
          storage_path?: string | null;
          public_url: string;
          alt_text?: string;
          sort_order?: number;
          is_primary?: boolean;
          created_at?: string;
          storage_bucket?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          product_id?: string;
          storage_path?: string | null;
          public_url?: string;
          alt_text?: string;
          sort_order?: number;
          is_primary?: boolean;
          created_at?: string;
          storage_bucket?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'product_images_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_images_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      product_import_batches: {
        Row: {
          id: string;
          store_id: string;
          actor_id: string | null;
          kind: string;
          mode: string;
          file_name: string;
          file_format: string;
          status: string;
          total_rows: number;
          ready_rows: number;
          skipped_rows: number;
          error_rows: number;
          row_results: Json;
          staged: Json;
          summary: Json | null;
          created_at: string;
          applied_at: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          actor_id?: string | null;
          kind: string;
          mode: string;
          file_name: string;
          file_format: string;
          status?: string;
          total_rows?: number;
          ready_rows?: number;
          skipped_rows?: number;
          error_rows?: number;
          row_results?: Json;
          staged?: Json;
          summary?: Json | null;
          created_at?: string;
          applied_at?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          actor_id?: string | null;
          kind?: string;
          mode?: string;
          file_name?: string;
          file_format?: string;
          status?: string;
          total_rows?: number;
          ready_rows?: number;
          skipped_rows?: number;
          error_rows?: number;
          row_results?: Json;
          staged?: Json;
          summary?: Json | null;
          created_at?: string;
          applied_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'product_import_batches_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_import_batches_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      product_specifications: {
        Row: {
          id: string;
          store_id: string;
          product_id: string;
          label: string;
          value: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: string;
          label: string;
          value: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          store_id?: string;
          product_id?: string;
          label?: string;
          value?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'product_specifications_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_specifications_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      product_variants: {
        Row: {
          id: string;
          store_id: string;
          product_id: string;
          sku: string;
          label: string;
          size_label: string | null;
          colour: string | null;
          finish: string | null;
          thickness_mm: number | null;
          sale_price_paise: number;
          cost_price_paise: number;
          mrp_paise: number | null;
          price_unit: string;
          pieces_per_box: number;
          coverage_sqft_per_box: number | null;
          is_default: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: string;
          sku: string;
          label: string;
          size_label?: string | null;
          colour?: string | null;
          finish?: string | null;
          thickness_mm?: number | null;
          sale_price_paise: number;
          cost_price_paise?: number;
          mrp_paise?: number | null;
          price_unit?: string;
          pieces_per_box?: number;
          coverage_sqft_per_box?: number | null;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          product_id?: string;
          sku?: string;
          label?: string;
          size_label?: string | null;
          colour?: string | null;
          finish?: string | null;
          thickness_mm?: number | null;
          sale_price_paise?: number;
          cost_price_paise?: number;
          mrp_paise?: number | null;
          price_unit?: string;
          pieces_per_box?: number;
          coverage_sqft_per_box?: number | null;
          is_default?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_variants_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_variants_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          store_id: string;
          category_id: string;
          subcategory_id: string | null;
          brand_id: string | null;
          sku: string;
          slug: string;
          name: string;
          description: string | null;
          model_number: string | null;
          material: string | null;
          finish: string | null;
          application: string | null;
          colour: string | null;
          size_label: string | null;
          thickness_mm: number | null;
          warranty_months: number | null;
          hsn_code: string | null;
          gst_rate_bps: number;
          unit_of_sale: string;
          is_featured: boolean;
          is_new_arrival: boolean;
          is_best_seller: boolean;
          is_special_offer: boolean;
          visibility: string;
          status: string;
          specs: Json;
          search_tsv: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          category_id: string;
          subcategory_id?: string | null;
          brand_id?: string | null;
          sku: string;
          slug: string;
          name: string;
          description?: string | null;
          model_number?: string | null;
          material?: string | null;
          finish?: string | null;
          application?: string | null;
          colour?: string | null;
          size_label?: string | null;
          thickness_mm?: number | null;
          warranty_months?: number | null;
          hsn_code?: string | null;
          gst_rate_bps?: number;
          unit_of_sale?: string;
          is_featured?: boolean;
          is_new_arrival?: boolean;
          is_best_seller?: boolean;
          is_special_offer?: boolean;
          visibility?: string;
          status?: string;
          specs?: Json;
          search_tsv?: string | null;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          category_id?: string;
          subcategory_id?: string | null;
          brand_id?: string | null;
          sku?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          model_number?: string | null;
          material?: string | null;
          finish?: string | null;
          application?: string | null;
          colour?: string | null;
          size_label?: string | null;
          thickness_mm?: number | null;
          warranty_months?: number | null;
          hsn_code?: string | null;
          gst_rate_bps?: number;
          unit_of_sale?: string;
          is_featured?: boolean;
          is_new_arrival?: boolean;
          is_best_seller?: boolean;
          is_special_offer?: boolean;
          visibility?: string;
          status?: string;
          specs?: Json;
          search_tsv?: string | null;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'products_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'subcategories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_brand_id_fkey';
            columns: ['brand_id'];
            isOneToOne: false;
            referencedRelation: 'brands';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_items: {
        Row: {
          id: string;
          store_id: string;
          project_room_id: string;
          variant_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          project_room_id: string;
          variant_id: string;
          quantity: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          project_room_id?: string;
          variant_id?: string;
          quantity?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_items_project_room_id_fkey';
            columns: ['project_room_id'];
            isOneToOne: false;
            referencedRelation: 'project_rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      project_rooms: {
        Row: {
          id: string;
          store_id: string;
          project_id: string;
          room_type: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          store_id: string;
          project_id: string;
          room_type: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          store_id?: string;
          project_id?: string;
          room_type?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'project_rooms_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_rooms_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string | null;
          customer_id: string | null;
          name: string;
          budget_paise: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id?: string | null;
          customer_id?: string | null;
          name: string;
          budget_paise?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string | null;
          customer_id?: string | null;
          name?: string;
          budget_paise?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          id: string;
          purchase_order_id: string;
          store_id: string;
          variant_id: string;
          quantity_ordered: number;
          quantity_received: number;
          unit_cost_paise: number;
        };
        Insert: {
          id?: string;
          purchase_order_id: string;
          store_id: string;
          variant_id: string;
          quantity_ordered: number;
          quantity_received?: number;
          unit_cost_paise: number;
        };
        Update: {
          id?: string;
          purchase_order_id?: string;
          store_id?: string;
          variant_id?: string;
          quantity_ordered?: number;
          quantity_received?: number;
          unit_cost_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_order_items_purchase_order_id_fkey';
            columns: ['purchase_order_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_order_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_order_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      purchase_orders: {
        Row: {
          id: string;
          store_id: string;
          supplier_id: string;
          po_number: string;
          status: string;
          expected_on: string | null;
          total_paise: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          supplier_id: string;
          po_number: string;
          status?: string;
          expected_on?: string | null;
          total_paise?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          supplier_id?: string;
          po_number?: string;
          status?: string;
          expected_on?: string | null;
          total_paise?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchase_orders_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_orders_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_orders_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      qr_analytics_settings: {
        Row: {
          id: boolean;
          attribution_hours: number;
          dedupe_minutes: number;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          attribution_hours?: number;
          dedupe_minutes?: number;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          attribution_hours?: number;
          dedupe_minutes?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      qr_codes: {
        Row: {
          id: string;
          store_id: string;
          target_type: string;
          target_id: string | null;
          public_url: string;
          storage_path: string | null;
          is_active: boolean;
          created_at: string;
          entry_token: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          target_type: string;
          target_id?: string | null;
          public_url: string;
          storage_path?: string | null;
          is_active?: boolean;
          created_at?: string;
          entry_token?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          target_type?: string;
          target_id?: string | null;
          public_url?: string;
          storage_path?: string | null;
          is_active?: boolean;
          created_at?: string;
          entry_token?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'qr_codes_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      qr_entry_events: {
        Row: {
          id: string;
          store_id: string;
          qr_code_id: string;
          guest_session_id: string;
          entered_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          qr_code_id: string;
          guest_session_id: string;
          entered_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          qr_code_id?: string;
          guest_session_id?: string;
          entered_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'qr_entry_events_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qr_entry_events_qr_code_id_fkey';
            columns: ['qr_code_id'];
            isOneToOne: false;
            referencedRelation: 'qr_codes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qr_entry_events_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      qr_order_attributions: {
        Row: {
          order_id: string;
          store_id: string;
          qr_code_id: string;
          entry_event_id: string;
          guest_session_id: string;
          entered_at: string;
          attributed_at: string;
        };
        Insert: {
          order_id: string;
          store_id: string;
          qr_code_id: string;
          entry_event_id: string;
          guest_session_id: string;
          entered_at: string;
          attributed_at?: string;
        };
        Update: {
          order_id?: string;
          store_id?: string;
          qr_code_id?: string;
          entry_event_id?: string;
          guest_session_id?: string;
          entered_at?: string;
          attributed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'qr_order_attributions_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qr_order_attributions_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qr_order_attributions_qr_code_id_fkey';
            columns: ['qr_code_id'];
            isOneToOne: false;
            referencedRelation: 'qr_codes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qr_order_attributions_entry_event_id_fkey';
            columns: ['entry_event_id'];
            isOneToOne: false;
            referencedRelation: 'qr_entry_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qr_order_attributions_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      qr_scan_logs: {
        Row: {
          id: string;
          store_id: string;
          qr_code_id: string;
          scanned_at: string;
          user_agent_hash: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          qr_code_id: string;
          scanned_at?: string;
          user_agent_hash?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          qr_code_id?: string;
          scanned_at?: string;
          user_agent_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'qr_scan_logs_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'qr_scan_logs_qr_code_id_fkey';
            columns: ['qr_code_id'];
            isOneToOne: false;
            referencedRelation: 'qr_codes';
            referencedColumns: ['id'];
          },
        ];
      };
      quotation_items: {
        Row: {
          id: string;
          quotation_id: string;
          store_id: string;
          variant_id: string;
          quantity: number;
          unit_price_paise: number;
          discount_paise: number;
          tax_paise: number;
          line_total_paise: number;
          sort_order: number;
          product_name_snapshot: string | null;
          variant_label_snapshot: string | null;
          sku_snapshot: string | null;
          hsn_code_snapshot: string | null;
          gst_rate_bps: number;
          gross_paise: number;
          taxable_paise: number;
        };
        Insert: {
          id?: string;
          quotation_id: string;
          store_id: string;
          variant_id: string;
          quantity: number;
          unit_price_paise: number;
          discount_paise?: number;
          tax_paise?: number;
          line_total_paise: number;
          sort_order?: number;
          product_name_snapshot?: string | null;
          variant_label_snapshot?: string | null;
          sku_snapshot?: string | null;
          hsn_code_snapshot?: string | null;
          gst_rate_bps?: number;
          gross_paise?: number;
          taxable_paise?: number;
        };
        Update: {
          id?: string;
          quotation_id?: string;
          store_id?: string;
          variant_id?: string;
          quantity?: number;
          unit_price_paise?: number;
          discount_paise?: number;
          tax_paise?: number;
          line_total_paise?: number;
          sort_order?: number;
          product_name_snapshot?: string | null;
          variant_label_snapshot?: string | null;
          sku_snapshot?: string | null;
          hsn_code_snapshot?: string | null;
          gst_rate_bps?: number;
          gross_paise?: number;
          taxable_paise?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'quotation_items_quotation_id_fkey';
            columns: ['quotation_id'];
            isOneToOne: false;
            referencedRelation: 'quotations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotation_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      quotations: {
        Row: {
          id: string;
          store_id: string;
          quotation_number: string;
          guest_session_id: string | null;
          customer_id: string | null;
          project_id: string | null;
          customer_name: string;
          customer_mobile: string | null;
          customer_email: string | null;
          requirements: string | null;
          delivery_expectation: string | null;
          status: string;
          valid_until: string | null;
          subtotal_paise: number;
          discount_paise: number;
          tax_paise: number;
          total_paise: number;
          converted_order_id: string | null;
          created_at: string;
          updated_at: string;
          source: string;
          created_by: string | null;
          project_name: string | null;
          delivery_address: string | null;
          taxable_paise: number;
          delivery_paise: number;
          terms: string | null;
          revision: number;
          share_token_hash: string | null;
          sent_at: string | null;
          responded_at: string | null;
          response_note: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          converted_at: string | null;
          guest_request_key: string | null;
          seller_legal_name: string | null;
          seller_billing_address: string | null;
          seller_gstin: string | null;
          seller_state: string | null;
          seller_gst_registration: string | null;
          seller_prices_include_gst: boolean | null;
          seller_snapshot_basis: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          quotation_number: string;
          guest_session_id?: string | null;
          customer_id?: string | null;
          project_id?: string | null;
          customer_name: string;
          customer_mobile?: string | null;
          customer_email?: string | null;
          requirements?: string | null;
          delivery_expectation?: string | null;
          status?: string;
          valid_until?: string | null;
          subtotal_paise?: number;
          discount_paise?: number;
          tax_paise?: number;
          total_paise?: number;
          converted_order_id?: string | null;
          created_at?: string;
          updated_at?: string;
          source?: string;
          created_by?: string | null;
          project_name?: string | null;
          delivery_address?: string | null;
          taxable_paise?: number;
          delivery_paise?: number;
          terms?: string | null;
          revision?: number;
          share_token_hash?: string | null;
          sent_at?: string | null;
          responded_at?: string | null;
          response_note?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          converted_at?: string | null;
          guest_request_key?: string | null;
          seller_legal_name?: string | null;
          seller_billing_address?: string | null;
          seller_gstin?: string | null;
          seller_state?: string | null;
          seller_gst_registration?: string | null;
          seller_prices_include_gst?: boolean | null;
          seller_snapshot_basis?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          quotation_number?: string;
          guest_session_id?: string | null;
          customer_id?: string | null;
          project_id?: string | null;
          customer_name?: string;
          customer_mobile?: string | null;
          customer_email?: string | null;
          requirements?: string | null;
          delivery_expectation?: string | null;
          status?: string;
          valid_until?: string | null;
          subtotal_paise?: number;
          discount_paise?: number;
          tax_paise?: number;
          total_paise?: number;
          converted_order_id?: string | null;
          created_at?: string;
          updated_at?: string;
          source?: string;
          created_by?: string | null;
          project_name?: string | null;
          delivery_address?: string | null;
          taxable_paise?: number;
          delivery_paise?: number;
          terms?: string | null;
          revision?: number;
          share_token_hash?: string | null;
          sent_at?: string | null;
          responded_at?: string | null;
          response_note?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          converted_at?: string | null;
          guest_request_key?: string | null;
          seller_legal_name?: string | null;
          seller_billing_address?: string | null;
          seller_gstin?: string | null;
          seller_state?: string | null;
          seller_gst_registration?: string | null;
          seller_prices_include_gst?: boolean | null;
          seller_snapshot_basis?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quotations_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotations_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotations_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotations_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotations_converted_order_id_fkey';
            columns: ['converted_order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      refund_items: {
        Row: {
          id: string;
          refund_id: string;
          store_id: string;
          order_item_id: string;
          variant_id: string;
          quantity: number;
          amount_paise: number;
          condition: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          refund_id: string;
          store_id: string;
          order_item_id: string;
          variant_id: string;
          quantity: number;
          amount_paise: number;
          condition: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          refund_id?: string;
          store_id?: string;
          order_item_id?: string;
          variant_id?: string;
          quantity?: number;
          amount_paise?: number;
          condition?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refund_items_refund_id_fkey';
            columns: ['refund_id'];
            isOneToOne: false;
            referencedRelation: 'refunds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_items_order_item_id_fkey';
            columns: ['order_item_id'];
            isOneToOne: false;
            referencedRelation: 'order_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      refund_request_items: {
        Row: {
          id: string;
          request_id: string;
          store_id: string;
          order_item_id: string;
          quantity: number;
        };
        Insert: {
          id?: string;
          request_id: string;
          store_id: string;
          order_item_id: string;
          quantity: number;
        };
        Update: {
          id?: string;
          request_id?: string;
          store_id?: string;
          order_item_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'refund_request_items_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'refund_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_request_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_request_items_order_item_id_fkey';
            columns: ['order_item_id'];
            isOneToOne: false;
            referencedRelation: 'order_items';
            referencedColumns: ['id'];
          },
        ];
      };
      refund_request_photos: {
        Row: {
          id: string;
          store_id: string;
          refund_request_id: string;
          guest_session_id: string;
          upload_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          refund_request_id: string;
          guest_session_id: string;
          upload_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          refund_request_id?: string;
          guest_session_id?: string;
          upload_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refund_request_photos_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_request_photos_refund_request_id_fkey';
            columns: ['refund_request_id'];
            isOneToOne: false;
            referencedRelation: 'refund_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_request_photos_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_request_photos_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: true;
            referencedRelation: 'storage_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
      refund_requests: {
        Row: {
          id: string;
          store_id: string;
          order_id: string;
          guest_session_id: string;
          status: string;
          reason_code: string;
          reason: string;
          decision_note: string | null;
          refund_id: string | null;
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id: string;
          guest_session_id: string;
          status?: string;
          reason_code: string;
          reason: string;
          decision_note?: string | null;
          refund_id?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          order_id?: string;
          guest_session_id?: string;
          status?: string;
          reason_code?: string;
          reason?: string;
          decision_note?: string | null;
          refund_id?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refund_requests_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_requests_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_requests_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_requests_refund_id_fkey';
            columns: ['refund_id'];
            isOneToOne: false;
            referencedRelation: 'refunds';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refund_requests_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      refunds: {
        Row: {
          id: string;
          store_id: string;
          payment_id: string;
          order_id: string;
          amount_paise: number;
          status: string;
          reason: string;
          provider_refund_id: string | null;
          requested_by: string | null;
          created_at: string;
          processed_at: string | null;
          refund_method: string | null;
          refund_type: string | null;
          request_key: string | null;
          failure_reason: string | null;
          finalized_at: string | null;
          gateway_state: string;
          gateway_attempts: number;
          gateway_lease_until: string | null;
          gateway_error: string | null;
          gateway_ambiguous_at: string | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          payment_id: string;
          order_id: string;
          amount_paise: number;
          status?: string;
          reason: string;
          provider_refund_id?: string | null;
          requested_by?: string | null;
          created_at?: string;
          processed_at?: string | null;
          refund_method?: string | null;
          refund_type?: string | null;
          request_key?: string | null;
          failure_reason?: string | null;
          finalized_at?: string | null;
          gateway_state?: string;
          gateway_attempts?: number;
          gateway_lease_until?: string | null;
          gateway_error?: string | null;
          gateway_ambiguous_at?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          payment_id?: string;
          order_id?: string;
          amount_paise?: number;
          status?: string;
          reason?: string;
          provider_refund_id?: string | null;
          requested_by?: string | null;
          created_at?: string;
          processed_at?: string | null;
          refund_method?: string | null;
          refund_type?: string | null;
          request_key?: string | null;
          failure_reason?: string | null;
          finalized_at?: string | null;
          gateway_state?: string;
          gateway_attempts?: number;
          gateway_lease_until?: string | null;
          gateway_error?: string | null;
          gateway_ambiguous_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'refunds_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      role_permissions: {
        Row: {
          role_code: string;
          permission_code: string;
        };
        Insert: {
          role_code: string;
          permission_code: string;
        };
        Update: {
          role_code?: string;
          permission_code?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_role_code_fkey';
            columns: ['role_code'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'role_permissions_permission_code_fkey';
            columns: ['permission_code'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['code'];
          },
        ];
      };
      roles: {
        Row: {
          code: string;
          description: string;
        };
        Insert: {
          code: string;
          description: string;
        };
        Update: {
          code?: string;
          description?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          store_id: string;
          variant_id: string;
          batch_id: string | null;
          movement_type: string;
          quantity: number;
          reference_type: string | null;
          reference_id: string | null;
          actor_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          variant_id: string;
          batch_id?: string | null;
          movement_type: string;
          quantity: number;
          reference_type?: string | null;
          reference_id?: string | null;
          actor_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          variant_id?: string;
          batch_id?: string | null;
          movement_type?: string;
          quantity?: number;
          reference_type?: string | null;
          reference_id?: string | null;
          actor_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_movements_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      storage_uploads: {
        Row: {
          id: string;
          store_id: string;
          bucket_id: string;
          object_path: string;
          kind: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string | null;
          claimed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          bucket_id: string;
          object_path: string;
          kind: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by?: string | null;
          claimed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          bucket_id?: string;
          object_path?: string;
          kind?: string;
          mime_type?: string;
          size_bytes?: number;
          uploaded_by?: string | null;
          claimed?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'storage_uploads_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'storage_uploads_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      store_counters: {
        Row: {
          store_id: string;
          kind: string;
          next_value: number;
        };
        Insert: {
          store_id: string;
          kind: string;
          next_value?: number;
        };
        Update: {
          store_id?: string;
          kind?: string;
          next_value?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'store_counters_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      store_member_permissions: {
        Row: {
          store_id: string;
          profile_id: string;
          permission_key: string;
          granted_by: string | null;
          granted_at: string;
        };
        Insert: {
          store_id: string;
          profile_id: string;
          permission_key: string;
          granted_by?: string | null;
          granted_at?: string;
        };
        Update: {
          store_id?: string;
          profile_id?: string;
          permission_key?: string;
          granted_by?: string | null;
          granted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_member_permissions_permission_key_fkey';
            columns: ['permission_key'];
            isOneToOne: false;
            referencedRelation: 'store_permission_keys';
            referencedColumns: ['key'];
          },
          {
            foreignKeyName: 'store_member_permissions_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_member_permissions_store_id_profile_id_fkey';
            columns: ['store_id', 'profile_id'];
            isOneToOne: false;
            referencedRelation: 'store_owners';
            referencedColumns: ['store_id', 'profile_id'];
          },
        ];
      };
      store_onboardings: {
        Row: {
          id: string;
          store_id: string | null;
          owner_profile_id: string | null;
          current_step: number;
          step_data: Json;
          status: string;
          created_by: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id?: string | null;
          owner_profile_id?: string | null;
          current_step?: number;
          step_data?: Json;
          status?: string;
          created_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string | null;
          owner_profile_id?: string | null;
          current_step?: number;
          step_data?: Json;
          status?: string;
          created_by?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_onboardings_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: true;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_onboardings_owner_profile_id_fkey';
            columns: ['owner_profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_onboardings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      store_owners: {
        Row: {
          store_id: string;
          profile_id: string;
          role: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          store_id: string;
          profile_id: string;
          role?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          store_id?: string;
          profile_id?: string;
          role?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_owners_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'store_owners_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      store_permission_keys: {
        Row: {
          key: string;
          label: string;
          area: string;
          sort_order: number;
        };
        Insert: {
          key: string;
          label: string;
          area: string;
          sort_order: number;
        };
        Update: {
          key?: string;
          label?: string;
          area?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      store_settings: {
        Row: {
          store_id: string;
          invoice_prefix: string;
          order_prefix: string;
          default_language: string;
          catalogue_visible: boolean;
          online_payment_enabled: boolean;
          cash_payment_enabled: boolean;
          delivery_charge_paise: number;
          free_delivery_above_paise: number | null;
          reservation_minutes: number;
          payment_expiry_minutes: number;
          opening_hours: Json;
          notification_email: string | null;
          updated_at: string;
        };
        Insert: {
          store_id: string;
          invoice_prefix?: string;
          order_prefix?: string;
          default_language?: string;
          catalogue_visible?: boolean;
          online_payment_enabled?: boolean;
          cash_payment_enabled?: boolean;
          delivery_charge_paise?: number;
          free_delivery_above_paise?: number | null;
          reservation_minutes?: number;
          payment_expiry_minutes?: number;
          opening_hours?: Json;
          notification_email?: string | null;
          updated_at?: string;
        };
        Update: {
          store_id?: string;
          invoice_prefix?: string;
          order_prefix?: string;
          default_language?: string;
          catalogue_visible?: boolean;
          online_payment_enabled?: boolean;
          cash_payment_enabled?: boolean;
          delivery_charge_paise?: number;
          free_delivery_above_paise?: number | null;
          reservation_minutes?: number;
          payment_expiry_minutes?: number;
          opening_hours?: Json;
          notification_email?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'store_settings_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: true;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      stores: {
        Row: {
          id: string;
          slug: string;
          name: string;
          status: string;
          gstin: string | null;
          address_line: string | null;
          city: string | null;
          state: string | null;
          pincode: string | null;
          phone: string | null;
          email: string | null;
          logo_url: string | null;
          brand_colour: string;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
          logo_path: string | null;
          banner_url: string | null;
          banner_path: string | null;
          legal_name: string | null;
          business_category: string | null;
          business_description: string | null;
          billing_address: string | null;
          gst_registration: string;
          prices_include_gst: boolean;
          state_code: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          status?: string;
          gstin?: string | null;
          address_line?: string | null;
          city?: string | null;
          state?: string | null;
          pincode?: string | null;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          brand_colour?: string;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
          logo_path?: string | null;
          banner_url?: string | null;
          banner_path?: string | null;
          legal_name?: string | null;
          business_category?: string | null;
          business_description?: string | null;
          billing_address?: string | null;
          gst_registration?: string;
          prices_include_gst?: boolean;
          state_code?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          status?: string;
          gstin?: string | null;
          address_line?: string | null;
          city?: string | null;
          state?: string | null;
          pincode?: string | null;
          phone?: string | null;
          email?: string | null;
          logo_url?: string | null;
          brand_colour?: string;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
          logo_path?: string | null;
          banner_url?: string | null;
          banner_path?: string | null;
          legal_name?: string | null;
          business_category?: string | null;
          business_description?: string | null;
          billing_address?: string | null;
          gst_registration?: string;
          prices_include_gst?: boolean;
          state_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stores_state_code_fkey';
            columns: ['state_code'];
            isOneToOne: false;
            referencedRelation: 'gst_state_codes';
            referencedColumns: ['code'];
          },
        ];
      };
      subcategories: {
        Row: {
          id: string;
          store_id: string;
          category_id: string;
          slug: string;
          name: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          store_id: string;
          category_id: string;
          slug: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          store_id?: string;
          category_id?: string;
          slug?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'subcategories_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subcategories_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_migration_allowances: {
        Row: {
          store_id: string;
          expires_on: string;
          reason: string;
          granted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          store_id: string;
          expires_on: string;
          reason: string;
          granted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          store_id?: string;
          expires_on?: string;
          reason?: string;
          granted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_migration_allowances_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: true;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_migration_allowances_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_payments: {
        Row: {
          id: string;
          subscription_id: string;
          store_id: string;
          amount_paise: number;
          status: string;
          reference: string | null;
          paid_on: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          subscription_id: string;
          store_id: string;
          amount_paise: number;
          status: string;
          reference?: string | null;
          paid_on?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          subscription_id?: string;
          store_id?: string;
          amount_paise?: number;
          status?: string;
          reference?: string | null;
          paid_on?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_payments_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_payments_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_plans: {
        Row: {
          id: string;
          code: string;
          name: string;
          billing_interval: string;
          price_paise: number;
          max_products: number | null;
          features: Json;
          is_active: boolean;
          created_at: string;
          max_users: number | null;
          users_unlimited: boolean;
          products_unlimited: boolean;
          description: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          billing_interval: string;
          price_paise: number;
          max_products?: number | null;
          features?: Json;
          is_active?: boolean;
          created_at?: string;
          max_users?: number | null;
          users_unlimited?: boolean;
          products_unlimited?: boolean;
          description?: string | null;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          billing_interval?: string;
          price_paise?: number;
          max_products?: number | null;
          features?: Json;
          is_active?: boolean;
          created_at?: string;
          max_users?: number | null;
          users_unlimited?: boolean;
          products_unlimited?: boolean;
          description?: string | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          store_id: string;
          plan_id: string;
          status: string;
          period_start: string;
          period_end: string;
          grace_ends_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          plan_id: string;
          status: string;
          period_start: string;
          period_end: string;
          grace_ends_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          plan_id?: string;
          status?: string;
          period_start?: string;
          period_end?: string;
          grace_ends_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscriptions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'subscription_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      supplier_invoices: {
        Row: {
          id: string;
          store_id: string;
          supplier_id: string;
          purchase_order_id: string | null;
          invoice_number: string;
          invoice_date: string;
          amount_paise: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          supplier_id: string;
          purchase_order_id?: string | null;
          invoice_number: string;
          invoice_date: string;
          amount_paise: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          supplier_id?: string;
          purchase_order_id?: string | null;
          invoice_number?: string;
          invoice_date?: string;
          amount_paise?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'supplier_invoices_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplier_invoices_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplier_invoices_purchase_order_id_fkey';
            columns: ['purchase_order_id'];
            isOneToOne: false;
            referencedRelation: 'purchase_orders';
            referencedColumns: ['id'];
          },
        ];
      };
      supplier_payments: {
        Row: {
          id: string;
          store_id: string;
          supplier_id: string;
          supplier_invoice_id: string | null;
          amount_paise: number;
          paid_on: string;
          method: string;
          reference: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          supplier_id: string;
          supplier_invoice_id?: string | null;
          amount_paise: number;
          paid_on?: string;
          method: string;
          reference?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          supplier_id?: string;
          supplier_invoice_id?: string | null;
          amount_paise?: number;
          paid_on?: string;
          method?: string;
          reference?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'supplier_payments_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplier_payments_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplier_payments_supplier_invoice_id_fkey';
            columns: ['supplier_invoice_id'];
            isOneToOne: false;
            referencedRelation: 'supplier_invoices';
            referencedColumns: ['id'];
          },
        ];
      };
      supplier_products: {
        Row: {
          supplier_id: string;
          store_id: string;
          variant_id: string;
          supplier_sku: string | null;
        };
        Insert: {
          supplier_id: string;
          store_id: string;
          variant_id: string;
          supplier_sku?: string | null;
        };
        Update: {
          supplier_id?: string;
          store_id?: string;
          variant_id?: string;
          supplier_sku?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'supplier_products_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplier_products_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supplier_products_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      suppliers: {
        Row: {
          id: string;
          store_id: string;
          name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          gstin: string | null;
          address: string | null;
          payment_terms_days: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          name: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          gstin?: string | null;
          address?: string | null;
          payment_terms_days?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          name?: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          gstin?: string | null;
          address?: string | null;
          payment_terms_days?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'suppliers_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      support_messages: {
        Row: {
          id: string;
          ticket_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          author_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ticket_id?: string;
          author_id?: string | null;
          body?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_messages_ticket_id_fkey';
            columns: ['ticket_id'];
            isOneToOne: false;
            referencedRelation: 'support_tickets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_messages_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      support_tickets: {
        Row: {
          id: string;
          store_id: string | null;
          requester_id: string | null;
          category: string;
          priority: string;
          status: string;
          subject: string;
          assigned_to: string | null;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          store_id?: string | null;
          requester_id?: string | null;
          category: string;
          priority?: string;
          status?: string;
          subject: string;
          assigned_to?: string | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          store_id?: string | null;
          requester_id?: string | null;
          category?: string;
          priority?: string;
          status?: string;
          subject?: string;
          assigned_to?: string | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'support_tickets_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_tickets_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_tickets_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      variant_price_history: {
        Row: {
          id: string;
          store_id: string;
          variant_id: string;
          sale_price_paise: number;
          cost_price_paise: number;
          effective_from: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          variant_id: string;
          sale_price_paise: number;
          cost_price_paise: number;
          effective_from?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          variant_id?: string;
          sale_price_paise?: number;
          cost_price_paise?: number;
          effective_from?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'variant_price_history_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'variant_price_history_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      wishlist_items: {
        Row: {
          wishlist_id: string;
          store_id: string;
          variant_id: string;
          created_at: string;
        };
        Insert: {
          wishlist_id: string;
          store_id: string;
          variant_id: string;
          created_at?: string;
        };
        Update: {
          wishlist_id?: string;
          store_id?: string;
          variant_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wishlist_items_wishlist_id_fkey';
            columns: ['wishlist_id'];
            isOneToOne: false;
            referencedRelation: 'wishlists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wishlist_items_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wishlist_items_variant_id_fkey';
            columns: ['variant_id'];
            isOneToOne: false;
            referencedRelation: 'product_variants';
            referencedColumns: ['id'];
          },
        ];
      };
      wishlists: {
        Row: {
          id: string;
          store_id: string;
          guest_session_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          guest_session_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          guest_session_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wishlists_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wishlists_guest_session_id_fkey';
            columns: ['guest_session_id'];
            isOneToOne: false;
            referencedRelation: 'guest_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      [fn: string]: { Args: Record<string, unknown>; Returns: unknown };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type StoreRow = Database['public']['Tables']['stores']['Row'];
export type ProductRow = Database['public']['Tables']['products']['Row'];
export type ProductVariantRow = Database['public']['Tables']['product_variants']['Row'];
export type GuestSessionRow = Database['public']['Tables']['guest_sessions']['Row'];
export type CartRow = Database['public']['Tables']['carts']['Row'];
export type CartItemRow = Database['public']['Tables']['cart_items']['Row'];
export type OrderRow = Database['public']['Tables']['orders']['Row'];
export type PaymentEventRow = Database['public']['Tables']['payment_events']['Row'];
export type StoreOwnerRow = Database['public']['Tables']['store_owners']['Row'];
