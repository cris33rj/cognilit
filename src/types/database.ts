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
            referencedRelation: "review"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      get_byok_secret: {
        Args: { p_review_id: string }
        Returns: {
          api_key: string
          provider: Database["public"]["Enums"]["llm_provider"]
        }[]
      }
      is_review_member: { Args: { p_review_id: string }; Returns: boolean }
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
    }
    Enums: {
      ai_target_kind: "eligibility" | "protocol_draft" | "screening"
      audit_actor_type: "human" | "ai" | "system"
      criterion_kind: "inclusion" | "exclusion" | "search_term"
      criterion_origin: "human" | "ai"
      llm_provider: "anthropic"
      member_role: "owner" | "reviewer" | "viewer"
      protocol_origin: "ai_draft" | "human"
      protocol_state: "draft" | "locked"
      question_framework: "spider" | "pico" | "peo" | "pcc" | "free"
      ratification_state: "pending" | "accepted" | "edited" | "rejected"
      suggestion_state:
        | "pending"
        | "accepted"
        | "edited"
        | "rejected"
        | "inferred"
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
      criterion_kind: ["inclusion", "exclusion", "search_term"],
      criterion_origin: ["human", "ai"],
      llm_provider: ["anthropic"],
      member_role: ["owner", "reviewer", "viewer"],
      protocol_origin: ["ai_draft", "human"],
      protocol_state: ["draft", "locked"],
      question_framework: ["spider", "pico", "peo", "pcc", "free"],
      ratification_state: ["pending", "accepted", "edited", "rejected"],
      suggestion_state: [
        "pending",
        "accepted",
        "edited",
        "rejected",
        "inferred",
      ],
    },
  },
} as const

