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
      activities: {
        Row: {
          body: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          due_date: string | null
          id: string
          org_id: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          org_id: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          request_count: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          org_id: string
          request_count?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          request_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          org_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          org_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          org_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          actions_result: Json | null
          automation_id: string
          duration_ms: number | null
          error_message: string | null
          executed_at: string | null
          id: string
          org_id: string
          status: string
          trigger_payload: Json | null
        }
        Insert: {
          actions_result?: Json | null
          automation_id: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          org_id: string
          status?: string
          trigger_payload?: Json | null
        }
        Update: {
          actions_result?: Json | null
          automation_id?: string
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string | null
          id?: string
          org_id?: string
          status?: string
          trigger_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          error_count: number | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          org_id: string
          run_count: number | null
          trigger: Json
          updated_at: string | null
        }
        Insert: {
          actions?: Json
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          org_id: string
          run_count?: number | null
          trigger?: Json
          updated_at?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          org_id?: string
          run_count?: number | null
          trigger?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          domain: string | null
          id: string
          industry: string | null
          linkedin_url: string | null
          name: string
          org_id: string
          owner_id: string | null
          revenue: number | null
          size: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name: string
          org_id: string
          owner_id?: string | null
          revenue?: number | null
          size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name?: string
          org_id?: string
          owner_id?: string | null
          revenue?: number | null
          size?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          cnh_categoria: string | null
          company_id: string | null
          cpf: string | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          lead_score: number | null
          linkedin_url: string | null
          org_id: string
          owner_id: string | null
          phone: string | null
          preferred_brand: string | null
          purchase_cycle_months: number | null
          status: Database["public"]["Enums"]["contact_status"] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          cnh_categoria?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          lead_score?: number | null
          linkedin_url?: string | null
          org_id: string
          owner_id?: string | null
          phone?: string | null
          preferred_brand?: string | null
          purchase_cycle_months?: number | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          cnh_categoria?: string | null
          company_id?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          lead_score?: number | null
          linkedin_url?: string | null
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          preferred_brand?: string | null
          purchase_cycle_months?: number | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string | null
          entity_type: string
          field_key: string
          field_label: string
          field_order: number | null
          field_type: string
          id: string
          is_required: boolean | null
          options: Json | null
          org_id: string
          show_in_card: boolean | null
          show_in_table: boolean | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          field_key: string
          field_label: string
          field_order?: number | null
          field_type: string
          id?: string
          is_required?: boolean | null
          options?: Json | null
          org_id: string
          show_in_card?: boolean | null
          show_in_table?: boolean | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          field_key?: string
          field_label?: string
          field_order?: number | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          options?: Json | null
          org_id?: string
          show_in_card?: boolean | null
          show_in_table?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_tags: {
        Row: {
          deal_id: string
          tag_id: string
        }
        Insert: {
          deal_id: string
          tag_id: string
        }
        Update: {
          deal_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_tags_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          close_date: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          delivery_date: string | null
          financing_status: string | null
          id: string
          loss_reason: string | null
          org_id: string
          owner_id: string | null
          payment_method: string | null
          probability: number | null
          qualification: Json | null
          qualification_score: number | null
          stage_id: string | null
          status: Database["public"]["Enums"]["deal_status"] | null
          test_drive_at: string | null
          title: string
          trade_in_id: string | null
          updated_at: string | null
          value: number | null
          vehicle_id: string | null
        }
        Insert: {
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_date?: string | null
          financing_status?: string | null
          id?: string
          loss_reason?: string | null
          org_id: string
          owner_id?: string | null
          payment_method?: string | null
          probability?: number | null
          qualification?: Json | null
          qualification_score?: number | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          test_drive_at?: string | null
          title: string
          trade_in_id?: string | null
          updated_at?: string | null
          value?: number | null
          vehicle_id?: string | null
        }
        Update: {
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_date?: string | null
          financing_status?: string | null
          id?: string
          loss_reason?: string | null
          org_id?: string
          owner_id?: string | null
          payment_method?: string | null
          probability?: number | null
          qualification?: Json | null
          qualification_score?: number | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"] | null
          test_drive_at?: string | null
          title?: string
          trade_in_id?: string | null
          updated_at?: string | null
          value?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_trade_in_id_fkey"
            columns: ["trade_in_id"]
            isOneToOne: false
            referencedRelation: "trade_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_connections: {
        Row: {
          connected_at: string | null
          email_address: string
          id: string
          is_active: boolean | null
          org_id: string
          provider: string
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          email_address: string
          id?: string
          is_active?: boolean | null
          org_id: string
          provider: string
          user_id: string
        }
        Update: {
          connected_at?: string | null
          email_address?: string
          id?: string
          is_active?: boolean | null
          org_id?: string
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_enrollments: {
        Row: {
          completed_at: string | null
          contact_id: string
          current_step: number | null
          enrolled_at: string | null
          id: string
          next_send_at: string | null
          org_id: string
          sequence_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          next_send_at?: string | null
          org_id: string
          sequence_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          next_send_at?: string | null
          org_id?: string
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_steps: {
        Row: {
          body_html: string | null
          created_at: string | null
          delay_days: number
          id: string
          org_id: string
          sequence_id: string
          step_order: number
          subject: string | null
          template_id: string | null
        }
        Insert: {
          body_html?: string | null
          created_at?: string | null
          delay_days?: number
          id?: string
          org_id: string
          sequence_id: string
          step_order?: number
          subject?: string | null
          template_id?: string | null
        }
        Update: {
          body_html?: string | null
          created_at?: string | null
          delay_days?: number
          id?: string
          org_id?: string
          sequence_id?: string
          step_order?: number
          subject?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_signatures: {
        Row: {
          created_at: string | null
          html: string
          id: string
          is_default: boolean | null
          name: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          html?: string
          id?: string
          is_default?: boolean | null
          name?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          html?: string
          id?: string
          is_default?: boolean | null
          name?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_signatures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          org_id: string
          subject: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body_html?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          subject: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body_html?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          subject?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          bcc_emails: Json | null
          body_html: string | null
          cc_emails: Json | null
          click_count: number | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          direction: string
          from_email: string | null
          id: string
          is_archived: boolean | null
          is_read: boolean | null
          last_clicked_at: string | null
          last_opened_at: string | null
          message_id: string | null
          open_count: number | null
          org_id: string
          provider: string | null
          sent_at: string | null
          snoozed_until: string | null
          status: string
          subject: string | null
          thread_id: string | null
          to_emails: Json | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          bcc_emails?: Json | null
          body_html?: string | null
          cc_emails?: Json | null
          click_count?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string
          from_email?: string | null
          id?: string
          is_archived?: boolean | null
          is_read?: boolean | null
          last_clicked_at?: string | null
          last_opened_at?: string | null
          message_id?: string | null
          open_count?: number | null
          org_id: string
          provider?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          bcc_emails?: Json | null
          body_html?: string | null
          cc_emails?: Json | null
          click_count?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          direction?: string
          from_email?: string | null
          id?: string
          is_archived?: boolean | null
          is_read?: boolean | null
          last_clicked_at?: string | null
          last_opened_at?: string | null
          message_id?: string | null
          open_count?: number | null
          org_id?: string
          provider?: string | null
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: Json | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fipe_cache: {
        Row: {
          ano_modelo: number
          atualizado_em: string
          fipe_code: string
          marca: string | null
          modelo: string | null
          valor: number | null
        }
        Insert: {
          ano_modelo: number
          atualizado_em?: string
          fipe_code: string
          marca?: string | null
          modelo?: string | null
          valor?: number | null
        }
        Update: {
          ano_modelo?: number
          atualizado_em?: string
          fipe_code?: string
          marca?: string | null
          modelo?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      integration_configs: {
        Row: {
          config: Json
          connected_at: string | null
          connected_by: string | null
          id: string
          is_active: boolean | null
          org_id: string
          provider: string
        }
        Insert: {
          config?: Json
          connected_at?: string | null
          connected_by?: string | null
          id?: string
          is_active?: boolean | null
          org_id: string
          provider: string
        }
        Update: {
          config?: Json
          connected_at?: string | null
          connected_by?: string | null
          id?: string
          is_active?: boolean | null
          org_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_history: {
        Row: {
          contact_id: string
          created_at: string | null
          event_type: string | null
          id: string
          org_id: string
          points: number
          reason: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          event_type?: string | null
          id?: string
          org_id: string
          points: number
          reason: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          event_type?: string | null
          id?: string
          org_id?: string
          points?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scoring_rules: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          is_active: boolean | null
          label: string
          org_id: string
          points: number
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          is_active?: boolean | null
          label: string
          org_id: string
          points?: number
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          is_active?: boolean | null
          label?: string
          org_id?: string
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_scoring_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loss_reasons: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string
          org_id: string
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          org_id: string
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          org_id?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loss_reasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          daily_summary: boolean | null
          daily_summary_hour: number | null
          email_daily_summary: boolean | null
          email_deal_won: boolean | null
          email_task_overdue: boolean | null
          id: string
          notify_assignment: boolean | null
          notify_deal_lost: boolean | null
          notify_deal_won: boolean | null
          notify_mention: boolean | null
          notify_task_overdue: boolean | null
          org_id: string
          user_id: string
        }
        Insert: {
          daily_summary?: boolean | null
          daily_summary_hour?: number | null
          email_daily_summary?: boolean | null
          email_deal_won?: boolean | null
          email_task_overdue?: boolean | null
          id?: string
          notify_assignment?: boolean | null
          notify_deal_lost?: boolean | null
          notify_deal_won?: boolean | null
          notify_mention?: boolean | null
          notify_task_overdue?: boolean | null
          org_id: string
          user_id: string
        }
        Update: {
          daily_summary?: boolean | null
          daily_summary_hour?: number | null
          email_daily_summary?: boolean | null
          email_deal_won?: boolean | null
          email_task_overdue?: boolean | null
          id?: string
          notify_assignment?: boolean | null
          notify_deal_lost?: boolean | null
          notify_deal_won?: boolean | null
          notify_mention?: boolean | null
          notify_task_overdue?: boolean | null
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed: boolean | null
          contact_created: boolean | null
          created_at: string | null
          deal_created: boolean | null
          demo_loaded: boolean | null
          dismissed_at: string | null
          email_connected: boolean | null
          id: string
          member_invited: boolean | null
          org_id: string
          pipeline_created: boolean | null
          profile_configured: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          contact_created?: boolean | null
          created_at?: string | null
          deal_created?: boolean | null
          demo_loaded?: boolean | null
          dismissed_at?: string | null
          email_connected?: boolean | null
          id?: string
          member_invited?: boolean | null
          org_id: string
          pipeline_created?: boolean | null
          profile_configured?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean | null
          contact_created?: boolean | null
          created_at?: string | null
          deal_created?: boolean | null
          demo_loaded?: boolean | null
          dismissed_at?: string | null
          email_connected?: boolean | null
          id?: string
          member_invited?: boolean | null
          org_id?: string
          pipeline_created?: boolean | null
          profile_configured?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_secrets: {
        Row: {
          created_at: string | null
          id: string
          key_name: string
          key_value: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_name: string
          key_value: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key_name?: string
          key_value?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          plan: string | null
          settings: Json | null
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          plan?: string | null
          settings?: Json | null
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          plan?: string | null
          settings?: Json | null
          slug?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          order: number
          org_id: string
          pipeline_id: string
          win_probability: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          order?: number
          org_id: string
          pipeline_id: string
          win_probability?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          order?: number
          org_id?: string
          pipeline_id?: string
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          is_default: boolean | null
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          org_id: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          name?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          org_id?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          org_id?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_history: {
        Row: {
          contato_id: string | null
          created_at: string
          data_compra: string
          deal_id: string | null
          financiamento_banco: string | null
          id: string
          org_id: string
          payment_method: string | null
          valor: number
          vehicle_id: string | null
        }
        Insert: {
          contato_id?: string | null
          created_at?: string
          data_compra: string
          deal_id?: string | null
          financiamento_banco?: string | null
          id?: string
          org_id: string
          payment_method?: string | null
          valor: number
          vehicle_id?: string | null
        }
        Update: {
          contato_id?: string | null
          created_at?: string
          data_compra?: string
          deal_id?: string | null
          financiamento_banco?: string | null
          id?: string
          org_id?: string
          payment_method?: string | null
          valor?: number
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_history_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_history_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_rules: {
        Row: {
          applies_to: string
          created_at: string | null
          id: string
          is_active: boolean | null
          metric: string
          name: string
          org_id: string
          risk_level: string
          threshold_days: number
        }
        Insert: {
          applies_to?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metric?: string
          name: string
          org_id: string
          risk_level?: string
          threshold_days?: number
        }
        Update: {
          applies_to?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metric?: string
          name?: string
          org_id?: string
          risk_level?: string
          threshold_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "risk_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          created_at: string | null
          id: string
          org_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          allowed?: boolean
          created_at?: string | null
          id?: string
          org_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          allowed?: boolean
          created_at?: string | null
          id?: string
          org_id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          assign_type: string
          created_at: string | null
          created_by: string | null
          current_value: number
          goal_type: string
          id: string
          org_id: string
          period_month: number
          period_year: number
          target_value: number
          team_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assign_type?: string
          created_at?: string | null
          created_by?: string | null
          current_value?: number
          goal_type?: string
          id?: string
          org_id: string
          period_month: number
          period_year: number
          target_value?: number
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assign_type?: string
          created_at?: string | null
          created_by?: string | null
          current_value?: number
          goal_type?: string
          id?: string
          org_id?: string
          period_month?: number
          period_year?: number
          target_value?: number
          team_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          filters: Json
          id: string
          name: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          name: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          filters?: Json
          id?: string
          name?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reminders: {
        Row: {
          contato_id: string | null
          created_at: string
          data_vencimento: string
          id: string
          metadata: Json
          org_id: string
          status: string
          tipo: string
          ultimo_alerta_em: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          contato_id?: string | null
          created_at?: string
          data_vencimento: string
          id?: string
          metadata?: Json
          org_id: string
          status?: string
          tipo: string
          ultimo_alerta_em?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          contato_id?: string | null
          created_at?: string
          data_vencimento?: string
          id?: string
          metadata?: Json
          org_id?: string
          status?: string
          tipo?: string
          ultimo_alerta_em?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_reminders_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reminders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          id: string
          kind: string | null
          name: string
          org_id: string
        }
        Insert: {
          color?: string | null
          id?: string
          kind?: string | null
          name: string
          org_id: string
        }
        Update: {
          color?: string | null
          id?: string
          kind?: string | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          contact_id: string | null
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          org_id: string
          page_title: string | null
          page_url: string | null
          referrer: string | null
          visitor_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          org_id: string
          page_title?: string | null
          page_url?: string | null
          referrer?: string | null
          visitor_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          page_title?: string | null
          page_url?: string | null
          referrer?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_ins: {
        Row: {
          ano: number | null
          condicao: string | null
          contato_id: string | null
          cor: string | null
          created_at: string
          deal_id: string | null
          estimativa_fipe: number | null
          estimativa_ia: number | null
          estimativa_ia_justificativa: string | null
          fotos: string[]
          id: string
          km: number | null
          marca: string | null
          modelo: string | null
          org_id: string
          owner_id: string | null
          status: string
          updated_at: string
          valor_final_ofertado: number | null
        }
        Insert: {
          ano?: number | null
          condicao?: string | null
          contato_id?: string | null
          cor?: string | null
          created_at?: string
          deal_id?: string | null
          estimativa_fipe?: number | null
          estimativa_ia?: number | null
          estimativa_ia_justificativa?: string | null
          fotos?: string[]
          id?: string
          km?: number | null
          marca?: string | null
          modelo?: string | null
          org_id: string
          owner_id?: string | null
          status?: string
          updated_at?: string
          valor_final_ofertado?: number | null
        }
        Update: {
          ano?: number | null
          condicao?: string | null
          contato_id?: string | null
          cor?: string | null
          created_at?: string
          deal_id?: string | null
          estimativa_fipe?: number | null
          estimativa_ia?: number | null
          estimativa_ia_justificativa?: string | null
          fotos?: string[]
          id?: string
          km?: number | null
          marca?: string | null
          modelo?: string | null
          org_id?: string
          owner_id?: string | null
          status?: string
          updated_at?: string
          valor_final_ofertado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_ins_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_ins_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_ins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          accepts_financing: boolean
          accepts_trade: boolean
          ano_fabricacao: number | null
          ano_modelo: number | null
          chassi: string | null
          combustivel: string | null
          commercial_notes: string | null
          cor: string | null
          created_at: string
          data_entrada: string
          deal_id_atual: string | null
          descricao: string | null
          fipe_code: string | null
          fipe_price: number | null
          fotos: string[]
          id: string
          km: number | null
          marca: string
          modelo: string
          opcionais: string[]
          org_id: string
          owner_id: string | null
          placa: string | null
          preco_custo: number | null
          preco_venda: number | null
          renavam: string | null
          status: string
          transmissao: string | null
          updated_at: string
          versao: string | null
        }
        Insert: {
          accepts_financing?: boolean
          accepts_trade?: boolean
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          chassi?: string | null
          combustivel?: string | null
          commercial_notes?: string | null
          cor?: string | null
          created_at?: string
          data_entrada?: string
          deal_id_atual?: string | null
          descricao?: string | null
          fipe_code?: string | null
          fipe_price?: number | null
          fotos?: string[]
          id?: string
          km?: number | null
          marca: string
          modelo: string
          opcionais?: string[]
          org_id: string
          owner_id?: string | null
          placa?: string | null
          preco_custo?: number | null
          preco_venda?: number | null
          renavam?: string | null
          status?: string
          transmissao?: string | null
          updated_at?: string
          versao?: string | null
        }
        Update: {
          accepts_financing?: boolean
          accepts_trade?: boolean
          ano_fabricacao?: number | null
          ano_modelo?: number | null
          chassi?: string | null
          combustivel?: string | null
          commercial_notes?: string | null
          cor?: string | null
          created_at?: string
          data_entrada?: string
          deal_id_atual?: string | null
          descricao?: string | null
          fipe_code?: string | null
          fipe_price?: number | null
          fotos?: string[]
          id?: string
          km?: number | null
          marca?: string
          modelo?: string
          opcionais?: string[]
          org_id?: string
          owner_id?: string | null
          placa?: string | null
          preco_custo?: number | null
          preco_venda?: number | null
          renavam?: string | null
          status?: string
          transmissao?: string | null
          updated_at?: string
          versao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_deal_id_atual_fkey"
            columns: ["deal_id_atual"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string | null
          events: string[]
          failure_count: number | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          org_id: string
          secret: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          events?: string[]
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
          org_id: string
          secret?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[]
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          org_id?: string
          secret?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_ai_config: {
        Row: {
          auto_create_lead: boolean
          fallback_msg: string
          id: string
          is_active: boolean
          lead_pipeline_id: string | null
          lead_stage_id: string | null
          max_ai_turns: number
          model: string
          off_hours_msg: string
          org_id: string
          quick_actions: Json
          response_delay_ms: number
          system_prompt: string
          updated_at: string
          working_hours: Json
        }
        Insert: {
          auto_create_lead?: boolean
          fallback_msg?: string
          id?: string
          is_active?: boolean
          lead_pipeline_id?: string | null
          lead_stage_id?: string | null
          max_ai_turns?: number
          model?: string
          off_hours_msg?: string
          org_id: string
          quick_actions?: Json
          response_delay_ms?: number
          system_prompt?: string
          updated_at?: string
          working_hours?: Json
        }
        Update: {
          auto_create_lead?: boolean
          fallback_msg?: string
          id?: string
          is_active?: boolean
          lead_pipeline_id?: string | null
          lead_stage_id?: string | null
          max_ai_turns?: number
          model?: string
          off_hours_msg?: string
          org_id?: string
          quick_actions?: Json
          response_delay_ms?: number
          system_prompt?: string
          updated_at?: string
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_config_lead_pipeline_id_fkey"
            columns: ["lead_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_config_lead_stage_id_fkey"
            columns: ["lead_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_ai_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          ai_context: Json
          assigned_to: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string
          deal_id: string | null
          id: string
          instance_id: string | null
          instance_name: string | null
          last_message: string | null
          last_message_at: string | null
          mode: string
          org_id: string
          phone_number: string
          profile_pic_url: string | null
          status: string
          tags: Json
          unread_count: number
        }
        Insert: {
          ai_context?: Json
          assigned_to?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          last_message?: string | null
          last_message_at?: string | null
          mode?: string
          org_id: string
          phone_number: string
          profile_pic_url?: string | null
          status?: string
          tags?: Json
          unread_count?: number
        }
        Update: {
          ai_context?: Json
          assigned_to?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          last_message?: string | null
          last_message_at?: string | null
          mode?: string
          org_id?: string
          phone_number?: string
          profile_pic_url?: string | null
          status?: string
          tags?: Json
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instance_secrets: {
        Row: {
          api_key: string
          api_url: string
          created_at: string
          id: string
          instance_id: string
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string
          id?: string
          instance_id: string
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_secrets_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          api_key: string
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          instance_id_external: string | null
          instance_name: string
          is_active: boolean
          is_default: boolean | null
          org_id: string
          phone_number: string | null
          provider_type: string
          qr_code: string | null
          qrcode_base64: string | null
          server_url: string
          status: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          instance_id_external?: string | null
          instance_name: string
          is_active?: boolean
          is_default?: boolean | null
          org_id: string
          phone_number?: string | null
          provider_type?: string
          qr_code?: string | null
          qrcode_base64?: string | null
          server_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          instance_id_external?: string | null
          instance_name?: string
          is_active?: boolean
          is_default?: boolean | null
          org_id?: string
          phone_number?: string | null
          provider_type?: string
          qr_code?: string | null
          qrcode_base64?: string | null
          server_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          ai_model: string | null
          caption: string | null
          content: string | null
          conversation_id: string
          direction: string
          evolution_id: string | null
          id: string
          is_ai: boolean
          media_mime: string | null
          media_url: string | null
          metadata: Json
          org_id: string
          quoted_msg_id: string | null
          sent_at: string
          status: string
          type: string
        }
        Insert: {
          ai_model?: string | null
          caption?: string | null
          content?: string | null
          conversation_id: string
          direction: string
          evolution_id?: string | null
          id?: string
          is_ai?: boolean
          media_mime?: string | null
          media_url?: string | null
          metadata?: Json
          org_id: string
          quoted_msg_id?: string | null
          sent_at?: string
          status?: string
          type?: string
        }
        Update: {
          ai_model?: string | null
          caption?: string | null
          content?: string | null
          conversation_id?: string
          direction?: string
          evolution_id?: string | null
          id?: string
          is_ai?: boolean
          media_mime?: string | null
          media_url?: string | null
          metadata?: Json
          org_id?: string
          quoted_msg_id?: string | null
          sent_at?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_quick_actions: {
        Row: {
          color: string
          config: Json
          icon: string
          id: string
          label: string
          order_index: number
          org_id: string
          type: string
        }
        Insert: {
          color?: string
          config?: Json
          icon?: string
          id?: string
          label: string
          order_index?: number
          org_id: string
          type: string
        }
        Update: {
          color?: string
          config?: Json
          icon?: string
          id?: string
          label?: string
          order_index?: number
          org_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_quick_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_invitation_id: string }; Returns: string }
      add_organization_member: {
        Args: {
          p_role?: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      attach_audit_trigger: { Args: { p_table: unknown }; Returns: undefined }
      create_organization_for_user: {
        Args: {
          p_name: string
          p_settings?: Json
          p_slug: string
          p_user_id: string
        }
        Returns: string
      }
      dispatch_repurchase_alerts: { Args: never; Returns: undefined }
      dispatch_service_reminders: { Args: never; Returns: undefined }
      get_my_pending_invitations: {
        Args: never
        Returns: {
          created_at: string
          id: string
          org_id: string
          org_name: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      get_repurchase_candidates: {
        Args: { p_org_id: string }
        Returns: {
          contato_id: string
          contato_nome: string
          dias_na_janela: number
          preferred_brand: string
          tem_deal_aberto: boolean
          ultima_compra_data: string
          ultima_compra_marca: string
          ultima_compra_modelo: string
        }[]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_org_owner: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: undefined
      }
      link_deal_to_vehicle: {
        Args: { p_deal_id: string; p_vehicle_id: string }
        Returns: Json
      }
      main_org_id: { Args: never; Returns: string }
      move_deal_to_stage: {
        Args: { p_deal_id: string; p_stage_id: string }
        Returns: {
          close_date: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          delivery_date: string | null
          financing_status: string | null
          id: string
          loss_reason: string | null
          org_id: string
          owner_id: string | null
          payment_method: string | null
          probability: number | null
          qualification: Json | null
          qualification_score: number | null
          stage_id: string | null
          status: Database["public"]["Enums"]["deal_status"] | null
          test_drive_at: string | null
          title: string
          trade_in_id: string | null
          updated_at: string | null
          value: number | null
          vehicle_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "deals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_role: { Args: never; Returns: Database["public"]["Enums"]["app_role"] }
      prepare_user_deletion: {
        Args: { p_transfer_to: string; p_user_id: string }
        Returns: Json
      }
      remove_organization_member: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: undefined
      }
      seed_automotive_pipelines: {
        Args: { p_org_id: string; p_tem_oficina?: boolean }
        Returns: Json
      }
      seed_automotive_tags: { Args: { p_org_id: string }; Returns: undefined }
      set_org_automotive_settings: {
        Args: {
          p_cnpj?: string
          p_marcas?: string[]
          p_org_id: string
          p_tem_oficina?: boolean
          p_volume?: number
        }
        Returns: {
          created_at: string | null
          id: string
          name: string
          plan: string | null
          settings: Json | null
          slug: string
        }
        SetofOptions: {
          from: "*"
          to: "organizations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      user_belongs_to_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_dependency_counts: { Args: { p_user_id: string }; Returns: Json }
      user_has_password: { Args: never; Returns: boolean }
      vault_get: { Args: { p_key: string }; Returns: string }
    }
    Enums: {
      activity_type: "call" | "email" | "meeting" | "note" | "task"
      app_role: "owner" | "admin" | "member"
      contact_status: "lead" | "prospect" | "customer" | "churned"
      deal_status: "open" | "won" | "lost"
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
    Enums: {
      activity_type: ["call", "email", "meeting", "note", "task"],
      app_role: ["owner", "admin", "member"],
      contact_status: ["lead", "prospect", "customer", "churned"],
      deal_status: ["open", "won", "lost"],
    },
  },
} as const
