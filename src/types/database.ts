export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_suggestion: {
        Row: {
          created_at: string
          grounding: Json | null
          id: string
          not_found: boolean
          output: Json
          provenance: Json
          review_id: string
          state: Database["public"]["Enums"]["suggestion_state"]
          target_id: string | null
          target_kind: Database["public"]["Enums"]["ai_target_kind"]
        }
        Insert: {
          created_at?: string
          grounding?: Json | null
          id?: string
          not_found?: boolean
          output: Json
          provenance: Json
          review_id: string
          state?: Database["public"]["Enums"]["suggestion_state"]
          target_id?: string | null
          target_kind: Database["public"]["Enums"]["ai_target_kind"]
        }
        Update: {
          created_at?: string
          grounding?: Json | null
          id?: string
          not_found?: boolean
          output?: Json
          provenance?: Json
          review_id?: string
          state?: Database["public"]["Enums"]["suggestion_state"]
          target_id?: string | null
          target_kind?: Database["public"]["Enums"]["ai_target_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestion_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ai_suggestion_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          cost: Json
          created_at: string
          id: string
          job_id: string | null
          phase: string
          review_id: string
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          cost?: Json
          created_at?: string
          id?: string
          job_id?: string | null
          phase: string
          review_id: string
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          cost?: Json
          created_at?: string
          id?: string
          job_id?: string | null
          phase?: string
          review_id?: string
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "ai_usage_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_entry: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          review_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          review_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_entry_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "audit_entry_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      byok_key: {
        Row: {
          created_at: string
          id: string
          provider: Database["public"]["Enums"]["llm_provider"]
          review_id: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["llm_provider"]
          review_id: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: Database["public"]["Enums"]["llm_provider"]
          review_id?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "byok_key_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "byok_key_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      dedup_decision: {
        Row: {
          actor: Database["public"]["Enums"]["dedup_actor"]
          created_at: string
          id: string
          is_reversed: boolean
          kind: Database["public"]["Enums"]["dedup_kind"]
          outcome: Database["public"]["Enums"]["dedup_outcome"]
          record_a_id: string
          record_b_id: string | null
          reversed_at: string | null
          review_id: string
          similarity: number | null
        }
        Insert: {
          actor: Database["public"]["Enums"]["dedup_actor"]
          created_at?: string
          id?: string
          is_reversed?: boolean
          kind: Database["public"]["Enums"]["dedup_kind"]
          outcome: Database["public"]["Enums"]["dedup_outcome"]
          record_a_id: string
          record_b_id?: string | null
          reversed_at?: string | null
          review_id: string
          similarity?: number | null
        }
        Update: {
          actor?: Database["public"]["Enums"]["dedup_actor"]
          created_at?: string
          id?: string
          is_reversed?: boolean
          kind?: Database["public"]["Enums"]["dedup_kind"]
          outcome?: Database["public"]["Enums"]["dedup_outcome"]
          record_a_id?: string
          record_b_id?: string | null
          reversed_at?: string | null
          review_id?: string
          similarity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dedup_decision_record_a_id_fkey"
            columns: ["record_a_id"]
            isOneToOne: false
            referencedRelation: "record"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedup_decision_record_b_id_fkey"
            columns: ["record_b_id"]
            isOneToOne: false
            referencedRelation: "record"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedup_decision_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "dedup_decision_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          byte_size: number
          created_at: string
          filename: string
          id: string
          page_count: number | null
          processing_status: Database["public"]["Enums"]["document_status"]
          record_id: string
          review_id: string
          storage_path: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          filename: string
          id?: string
          page_count?: number | null
          processing_status?: Database["public"]["Enums"]["document_status"]
          record_id: string
          review_id: string
          storage_path: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          filename?: string
          id?: string
          page_count?: number | null
          processing_status?: Database["public"]["Enums"]["document_status"]
          record_id?: string
          review_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "record"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "document_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      eligibility_criterion: {
        Row: {
          ai_suggestion_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["criterion_kind"]
          origin: Database["public"]["Enums"]["criterion_origin"]
          question_id: string
          ratification_state: Database["public"]["Enums"]["ratification_state"]
          review_id: string
          text: string
        }
        Insert: {
          ai_suggestion_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["criterion_kind"]
          origin: Database["public"]["Enums"]["criterion_origin"]
          question_id: string
          ratification_state?: Database["public"]["Enums"]["ratification_state"]
          review_id: string
          text: string
        }
        Update: {
          ai_suggestion_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["criterion_kind"]
          origin?: Database["public"]["Enums"]["criterion_origin"]
          question_id?: string
          ratification_state?: Database["public"]["Enums"]["ratification_state"]
          review_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "eligibility_criterion_ai_suggestion_id_fkey"
            columns: ["ai_suggestion_id"]
            isOneToOne: false
            referencedRelation: "ai_suggestion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eligibility_criterion_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eligibility_criterion_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "eligibility_criterion_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      exclusion_reason: {
        Row: {
          created_at: string
          dismissed: boolean
          id: string
          is_active: boolean
          label: string
          origin: string
          review_id: string
          sort_order: number
          source_criterion_id: string | null
        }
        Insert: {
          created_at?: string
          dismissed?: boolean
          id?: string
          is_active?: boolean
          label: string
          origin?: string
          review_id: string
          sort_order?: number
          source_criterion_id?: string | null
        }
        Update: {
          created_at?: string
          dismissed?: boolean
          id?: string
          is_active?: boolean
          label?: string
          origin?: string
          review_id?: string
          sort_order?: number
          source_criterion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exclusion_reason_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "exclusion_reason_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exclusion_reason_source_criterion_id_fkey"
            columns: ["source_criterion_id"]
            isOneToOne: false
            referencedRelation: "eligibility_criterion"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_field: {
        Row: {
          created_at: string
          form_id: string
          id: string
          is_active: boolean
          name: string
          options: Json | null
          review_id: string
          sort_order: number
          type: Database["public"]["Enums"]["extraction_field_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          is_active?: boolean
          name: string
          options?: Json | null
          review_id: string
          sort_order?: number
          type: Database["public"]["Enums"]["extraction_field_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          is_active?: boolean
          name?: string
          options?: Json | null
          review_id?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["extraction_field_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_field_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "extraction_form"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_field_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "extraction_field_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_form: {
        Row: {
          created_at: string
          id: string
          review_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_form_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "extraction_form_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      job: {
        Row: {
          actual_cost: Json | null
          created_at: string
          estimated_cost: Json | null
          finished_at: string | null
          id: string
          progress: number
          review_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
        }
        Insert: {
          actual_cost?: Json | null
          created_at?: string
          estimated_cost?: Json | null
          finished_at?: string | null
          id?: string
          progress?: number
          review_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
        }
        Update: {
          actual_cost?: Json | null
          created_at?: string
          estimated_cost?: Json | null
          finished_at?: string | null
          id?: string
          progress?: number
          review_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          type?: Database["public"]["Enums"]["job_type"]
        }
        Relationships: [
          {
            foreignKeyName: "job_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "job_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      job_item: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          id: string
          job_id: string
          payload: Json
          review_id: string
          status: Database["public"]["Enums"]["job_item_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          job_id: string
          payload: Json
          review_id: string
          status?: Database["public"]["Enums"]["job_item_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string
          payload?: Json
          review_id?: string
          status?: Database["public"]["Enums"]["job_item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "job_item_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_item_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "job_item_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      member: {
        Row: {
          created_at: string
          id: string
          review_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "member_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      protocol: {
        Row: {
          ai_suggestion_id: string | null
          content: Json
          created_at: string
          id: string
          locked_at: string | null
          origin: Database["public"]["Enums"]["protocol_origin"]
          review_id: string
          state: Database["public"]["Enums"]["protocol_state"]
          updated_at: string
        }
        Insert: {
          ai_suggestion_id?: string | null
          content?: Json
          created_at?: string
          id?: string
          locked_at?: string | null
          origin?: Database["public"]["Enums"]["protocol_origin"]
          review_id: string
          state?: Database["public"]["Enums"]["protocol_state"]
          updated_at?: string
        }
        Update: {
          ai_suggestion_id?: string | null
          content?: Json
          created_at?: string
          id?: string
          locked_at?: string | null
          origin?: Database["public"]["Enums"]["protocol_origin"]
          review_id?: string
          state?: Database["public"]["Enums"]["protocol_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "protocol_ai_suggestion_id_fkey"
            columns: ["ai_suggestion_id"]
            isOneToOne: false
            referencedRelation: "ai_suggestion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "protocol_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_amendment: {
        Row: {
          change: Json
          created_at: string
          dated_at: string
          id: string
          protocol_id: string
          review_id: string
          version: number
        }
        Insert: {
          change: Json
          created_at?: string
          dated_at?: string
          id?: string
          protocol_id: string
          review_id: string
          version: number
        }
        Update: {
          change?: Json
          created_at?: string
          dated_at?: string
          id?: string
          protocol_id?: string
          review_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "protocol_amendment_protocol_id_fkey"
            columns: ["protocol_id"]
            isOneToOne: false
            referencedRelation: "protocol"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocol_amendment_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "protocol_amendment_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      question: {
        Row: {
          created_at: string
          fields: Json
          framework: Database["public"]["Enums"]["question_framework"]
          id: string
          question_text: string
          review_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fields?: Json
          framework?: Database["public"]["Enums"]["question_framework"]
          id?: string
          question_text?: string
          review_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fields?: Json
          framework?: Database["public"]["Enums"]["question_framework"]
          id?: string
          question_text?: string
          review_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "question_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: true
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      record: {
        Row: {
          corpus_state: Database["public"]["Enums"]["corpus_state"]
          created_at: string
          doi_normalized: string | null
          ft_decision: Database["public"]["Enums"]["ft_decision_state"] | null
          ft_exclusion_reason_id: string | null
          id: string
          job_item_id: string | null
          metadata: Json
          raw: Json
          review_id: string
          search_id: string | null
          source_format: Database["public"]["Enums"]["source_format"]
          title_norm: string | null
          ts_decision: Database["public"]["Enums"]["ts_decision_state"] | null
          updated_at: string
        }
        Insert: {
          corpus_state?: Database["public"]["Enums"]["corpus_state"]
          created_at?: string
          doi_normalized?: string | null
          ft_decision?: Database["public"]["Enums"]["ft_decision_state"] | null
          ft_exclusion_reason_id?: string | null
          id?: string
          job_item_id?: string | null
          metadata: Json
          raw: Json
          review_id: string
          search_id?: string | null
          source_format: Database["public"]["Enums"]["source_format"]
          title_norm?: string | null
          ts_decision?: Database["public"]["Enums"]["ts_decision_state"] | null
          updated_at?: string
        }
        Update: {
          corpus_state?: Database["public"]["Enums"]["corpus_state"]
          created_at?: string
          doi_normalized?: string | null
          ft_decision?: Database["public"]["Enums"]["ft_decision_state"] | null
          ft_exclusion_reason_id?: string | null
          id?: string
          job_item_id?: string | null
          metadata?: Json
          raw?: Json
          review_id?: string
          search_id?: string | null
          source_format?: Database["public"]["Enums"]["source_format"]
          title_norm?: string | null
          ts_decision?: Database["public"]["Enums"]["ts_decision_state"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_ft_exclusion_reason_fk"
            columns: ["ft_exclusion_reason_id"]
            isOneToOne: false
            referencedRelation: "exclusion_reason"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_ft_exclusion_reason_fk"
            columns: ["ft_exclusion_reason_id"]
            isOneToOne: false
            referencedRelation: "prisma_exclusion_breakdown"
            referencedColumns: ["reason_id"]
          },
          {
            foreignKeyName: "record_job_item_fk"
            columns: ["job_item_id"]
            isOneToOne: false
            referencedRelation: "job_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "record_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "search"
            referencedColumns: ["id"]
          },
        ]
      }
      review: {
        Row: {
          active_screening_started_at: string | null
          created_at: string
          created_by: string
          id: string
          pipeline_config: Json
          title: string
        }
        Insert: {
          active_screening_started_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          pipeline_config?: Json
          title: string
        }
        Update: {
          active_screening_started_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          pipeline_config?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_decision: {
        Row: {
          actor: string
          ai_suggestion_id: string | null
          created_at: string
          decision: Database["public"]["Enums"]["screening_choice"]
          exclusion_reason_id: string | null
          id: string
          is_reversed: boolean
          record_id: string
          reversed_at: string | null
          review_id: string
          stage: Database["public"]["Enums"]["screening_stage"]
        }
        Insert: {
          actor?: string
          ai_suggestion_id?: string | null
          created_at?: string
          decision: Database["public"]["Enums"]["screening_choice"]
          exclusion_reason_id?: string | null
          id?: string
          is_reversed?: boolean
          record_id: string
          reversed_at?: string | null
          review_id: string
          stage: Database["public"]["Enums"]["screening_stage"]
        }
        Update: {
          actor?: string
          ai_suggestion_id?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["screening_choice"]
          exclusion_reason_id?: string | null
          id?: string
          is_reversed?: boolean
          record_id?: string
          reversed_at?: string | null
          review_id?: string
          stage?: Database["public"]["Enums"]["screening_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "screening_decision_ai_suggestion_id_fkey"
            columns: ["ai_suggestion_id"]
            isOneToOne: false
            referencedRelation: "ai_suggestion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_decision_exclusion_reason_id_fkey"
            columns: ["exclusion_reason_id"]
            isOneToOne: false
            referencedRelation: "exclusion_reason"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_decision_exclusion_reason_id_fkey"
            columns: ["exclusion_reason_id"]
            isOneToOne: false
            referencedRelation: "prisma_exclusion_breakdown"
            referencedColumns: ["reason_id"]
          },
          {
            foreignKeyName: "screening_decision_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "record"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_decision_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "screening_decision_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      search: {
        Row: {
          created_at: string
          database: string
          hits: number
          id: string
          query_string: string
          review_id: string
          searched_on: string
        }
        Insert: {
          created_at?: string
          database: string
          hits: number
          id?: string
          query_string: string
          review_id: string
          searched_on: string
        }
        Update: {
          created_at?: string
          database?: string
          hits?: number
          id?: string
          query_string?: string
          review_id?: string
          searched_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "search_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
      text_layer: {
        Row: {
          char_end: number
          char_start: number
          content: string
          created_at: string
          document_id: string
          id: string
          origin: Database["public"]["Enums"]["text_origin"]
          page: number
          review_id: string
        }
        Insert: {
          char_end: number
          char_start: number
          content: string
          created_at?: string
          document_id: string
          id?: string
          origin: Database["public"]["Enums"]["text_origin"]
          page: number
          review_id: string
        }
        Update: {
          char_end?: number
          char_start?: number
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          origin?: Database["public"]["Enums"]["text_origin"]
          page?: number
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "text_layer_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "text_layer_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "text_layer_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      prisma_counter: {
        Row: {
          duplicates: number | null
          excluded_ft: number | null
          excluded_ts: number | null
          identified: number | null
          included_ft: number | null
          included_ts: number | null
          maybe_ts: number | null
          passed_ts: number | null
          review_id: string | null
          screened: number | null
        }
        Relationships: []
      }
      prisma_exclusion_breakdown: {
        Row: {
          n: number | null
          reason_id: string | null
          reason_label: string | null
          review_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "prisma_counter"
            referencedColumns: ["review_id"]
          },
          {
            foreignKeyName: "record_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "review"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_exclusion_reason: {
        Args: { p_label: string; p_review_id: string }
        Returns: string
      }
      add_extraction_field: {
        Args: {
          p_name: string
          p_options: Json
          p_review_id: string
          p_type: Database["public"]["Enums"]["extraction_field_type"]
        }
        Returns: {
          created_at: string
          form_id: string
          id: string
          is_active: boolean
          name: string
          options: Json | null
          review_id: string
          sort_order: number
          type: Database["public"]["Enums"]["extraction_field_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "extraction_field"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_protocol_amendment: {
        Args: { p_change: Json; p_review_id: string }
        Returns: {
          change: Json
          created_at: string
          dated_at: string
          id: string
          protocol_id: string
          review_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "protocol_amendment"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_import_job: {
        Args: {
          p_format: Database["public"]["Enums"]["source_format"]
          p_items: Json
          p_review_id: string
          p_search: Json
        }
        Returns: {
          actual_cost: Json | null
          created_at: string
          estimated_cost: Json | null
          finished_at: string | null
          id: string
          progress: number
          review_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
        }
        SetofOptions: {
          from: "*"
          to: "job"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_pdf_pipeline_job: {
        Args: {
          p_byte_size: number
          p_document_id: string
          p_filename: string
          p_record_id: string
          p_review_id: string
          p_storage_path: string
        }
        Returns: Json
      }
      create_review: {
        Args: { p_title: string }
        Returns: {
          active_screening_started_at: string | null
          created_at: string
          created_by: string
          id: string
          pipeline_config: Json
          title: string
        }
        SetofOptions: {
          from: "*"
          to: "review"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_screening_job: {
        Args: { p_record_ids?: Json; p_review_id: string }
        Returns: {
          actual_cost: Json | null
          created_at: string
          estimated_cost: Json | null
          finished_at: string | null
          id: string
          progress: number
          review_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
          type: Database["public"]["Enums"]["job_type"]
        }
        SetofOptions: {
          from: "*"
          to: "job"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_fuzzy: {
        Args: {
          p_outcome: Database["public"]["Enums"]["dedup_outcome"]
          p_record_a: string
          p_record_b: string
          p_review_id: string
          p_similarity: number
        }
        Returns: string
      }
      decide_screening: {
        Args: {
          p_ai_suggestion_id?: string
          p_decision: Database["public"]["Enums"]["screening_choice"]
          p_exclusion_reason_id?: string
          p_record_id: string
          p_review_id: string
          p_stage: Database["public"]["Enums"]["screening_stage"]
        }
        Returns: string
      }
      dedup_exact: { Args: { p_review_id: string }; Returns: number }
      ensure_exclusion_reasons: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      ensure_extraction_form: {
        Args: { p_review_id: string }
        Returns: {
          created_at: string
          id: string
          review_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "extraction_form"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_byok_secret: {
        Args: { p_review_id: string }
        Returns: {
          api_key: string
          provider: Database["public"]["Enums"]["llm_provider"]
        }[]
      }
      insert_import_record: {
        Args: {
          p_doi_normalized: string
          p_job_item_id: string
          p_metadata: Json
          p_raw: Json
          p_review_id: string
          p_search_id: string
          p_source_format: Database["public"]["Enums"]["source_format"]
          p_title_norm: string
        }
        Returns: string
      }
      is_review_member: { Args: { p_review_id: string }; Returns: boolean }
      list_fuzzy_candidates: {
        Args: { p_review_id: string; p_threshold?: number }
        Returns: {
          record_a_id: string
          record_b_id: string
          similarity: number
          title_a: string
          title_b: string
          year_a: string
          year_b: string
        }[]
      }
      list_reason_usage: {
        Args: { p_reason_id: string }
        Returns: {
          decision_id: string
          record_id: string
          title: string
        }[]
      }
      list_screening_queue: {
        Args: {
          p_review_id: string
          p_stage: Database["public"]["Enums"]["screening_stage"]
        }
        Returns: {
          abstract: string
          ai_confidence: number
          ai_reason: string
          ai_recommendation: string
          ai_state: Database["public"]["Enums"]["suggestion_state"]
          ai_suggestion_id: string
          corpus_state: Database["public"]["Enums"]["corpus_state"]
          decision_id: string
          ft_decision: Database["public"]["Enums"]["ft_decision_state"]
          ft_exclusion_reason_id: string
          record_id: string
          title: string
          ts_decision: Database["public"]["Enums"]["ts_decision_state"]
          year: string
        }[]
      }
      lock_protocol: {
        Args: { p_review_id: string }
        Returns: {
          ai_suggestion_id: string | null
          content: Json
          created_at: string
          id: string
          locked_at: string | null
          origin: Database["public"]["Enums"]["protocol_origin"]
          review_id: string
          state: Database["public"]["Enums"]["protocol_state"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "protocol"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      normalize_reason_label: { Args: { "": string }; Returns: string }
      regenerate_eligibility_criteria: {
        Args: {
          p_items: Json
          p_not_found: boolean
          p_output: Json
          p_provenance: Json
          p_review_id: string
        }
        Returns: number
      }
      remove_extraction_field: {
        Args: { p_field_id: string }
        Returns: {
          created_at: string
          form_id: string
          id: string
          is_active: boolean
          name: string
          options: Json | null
          review_id: string
          sort_order: number
          type: Database["public"]["Enums"]["extraction_field_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "extraction_field"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reverse_dedup: { Args: { p_decision_id: string }; Returns: undefined }
      reverse_screening: { Args: { p_decision_id: string }; Returns: undefined }
      seed_default_exclusion_reasons: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      set_byok_key: {
        Args: {
          p_api_key: string
          p_provider: Database["public"]["Enums"]["llm_provider"]
          p_review_id: string
        }
        Returns: {
          created_at: string
          id: string
          provider: Database["public"]["Enums"]["llm_provider"]
          review_id: string
          vault_secret_id: string
        }
        SetofOptions: {
          from: "*"
          to: "byok_key"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_exclusion_reason_active: {
        Args: { p_active: boolean; p_reason_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_exclusion_reasons_from_criteria: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      update_extraction_field: {
        Args: {
          p_field_id: string
          p_name: string
          p_options: Json
          p_type: Database["public"]["Enums"]["extraction_field_type"]
        }
        Returns: {
          created_at: string
          form_id: string
          id: string
          is_active: boolean
          name: string
          options: Json | null
          review_id: string
          sort_order: number
          type: Database["public"]["Enums"]["extraction_field_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "extraction_field"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      ai_target_kind: "eligibility" | "protocol_draft" | "screening"
      audit_actor_type: "human" | "ai" | "system"
      corpus_state:
        | "imported"
        | "active"
        | "duplicate_exact"
        | "duplicate_fuzzy"
        | "excluded_ts"
        | "maybe_ts"
        | "included_ts"
        | "excluded_ft"
        | "included_ft"
      criterion_kind: "inclusion" | "exclusion" | "search_term"
      criterion_origin: "human" | "ai"
      dedup_actor: "system" | "human"
      dedup_kind: "exact_auto" | "fuzzy_human"
      dedup_outcome: "removed" | "merged" | "kept_distinct"
      document_status:
        | "queued"
        | "processing"
        | "text_ready"
        | "partial"
        | "failed"
      extraction_field_type: "text" | "number" | "date" | "boolean" | "select"
      ft_decision_state: "included" | "excluded"
      job_item_status: "pending" | "done" | "failed"
      job_status:
        | "queued"
        | "running"
        | "completed"
        | "completed_with_errors"
        | "failed"
      job_type: "import_parse" | "ai_screening_batch" | "pdf_text_pipeline"
      llm_provider: "anthropic"
      member_role: "owner" | "reviewer" | "viewer"
      protocol_origin: "ai_draft" | "human"
      protocol_state: "draft" | "locked"
      question_framework: "spider" | "pico" | "peo" | "pcc" | "free"
      ratification_state: "pending" | "accepted" | "edited" | "rejected"
      screening_choice: "include" | "exclude" | "maybe"
      screening_stage: "title_abstract" | "full_text"
      source_format: "ris" | "bibtex" | "csv"
      suggestion_state:
        | "pending"
        | "accepted"
        | "edited"
        | "rejected"
        | "inferred"
      text_origin: "nativo" | "ocr_ia"
      ts_decision_state: "included" | "excluded" | "maybe"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_target_kind: ["eligibility", "protocol_draft", "screening"],
      audit_actor_type: ["human", "ai", "system"],
      corpus_state: [
        "imported",
        "active",
        "duplicate_exact",
        "duplicate_fuzzy",
        "excluded_ts",
        "maybe_ts",
        "included_ts",
        "excluded_ft",
        "included_ft",
      ],
      criterion_kind: ["inclusion", "exclusion", "search_term"],
      criterion_origin: ["human", "ai"],
      dedup_actor: ["system", "human"],
      dedup_kind: ["exact_auto", "fuzzy_human"],
      dedup_outcome: ["removed", "merged", "kept_distinct"],
      document_status: [
        "queued",
        "processing",
        "text_ready",
        "partial",
        "failed",
      ],
      extraction_field_type: ["text", "number", "date", "boolean", "select"],
      ft_decision_state: ["included", "excluded"],
      job_item_status: ["pending", "done", "failed"],
      job_status: [
        "queued",
        "running",
        "completed",
        "completed_with_errors",
        "failed",
      ],
      job_type: ["import_parse", "ai_screening_batch", "pdf_text_pipeline"],
      llm_provider: ["anthropic"],
      member_role: ["owner", "reviewer", "viewer"],
      protocol_origin: ["ai_draft", "human"],
      protocol_state: ["draft", "locked"],
      question_framework: ["spider", "pico", "peo", "pcc", "free"],
      ratification_state: ["pending", "accepted", "edited", "rejected"],
      screening_choice: ["include", "exclude", "maybe"],
      screening_stage: ["title_abstract", "full_text"],
      source_format: ["ris", "bibtex", "csv"],
      suggestion_state: [
        "pending",
        "accepted",
        "edited",
        "rejected",
        "inferred",
      ],
      text_origin: ["nativo", "ocr_ia"],
      ts_decision_state: ["included", "excluded", "maybe"],
    },
  },
} as const

