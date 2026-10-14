import type { PrismaCounters, ExclusionCount } from "@/lib/prisma/queries";

export type SectionKind =
  | "methods"
  | "results"
  | "discussion"
  | "conclusion"
  | "ai_declaration"
  | "deviations";

export type EditState = "deterministic" | "ai_generated" | "human_edited";

/** Insumos factuais p/ as seções determinísticas (carregados pela camada IO). */
export interface ReportInputs {
  question: {
    framework: string;
    questionText: string;
    fields: Record<string, string>;
  } | null;
  criteria: { kind: "inclusion" | "exclusion" | "search_term"; text: string }[];
  protocol: { state: "draft" | "locked"; lockedAt: string | null } | null;
  searchQuery: string;
  searches: { database: string; recordCount: number }[];
  counters: PrismaCounters;
  exclusions: ExclusionCount[];
  amendments: {
    version: number;
    datedAt: string;
    change: Record<string, unknown>;
  }[];
  themes: { name: string; narrative: string }[];
  aiSuggestions: {
    targetKind: string;
    model: string;
    version: string;
    state: string;
  }[];
  optionalPhasesOff: { key: string; label: string }[];
}

export interface BuiltSection {
  kind: SectionKind;
  content: string;
  order: number;
}
