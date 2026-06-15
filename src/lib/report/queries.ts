import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportInputs, SectionKind, EditState } from "./types";
import { composeSuggestedQuery } from "@/lib/search/suggest";

interface Deps {
  supabase: SupabaseClient;
}

const OPTIONAL_PHASES_OFF = [
  { key: "risk_of_bias", label: "Risco de Viés" },
  { key: "certainty", label: "Certeza (CERQual)" },
]; // D19: ambas OFF na v1.

/** Lê todos os insumos factuais p/ as seções determinísticas. */
export async function loadReportInputs(
  deps: Deps,
  reviewId: string,
): Promise<ReportInputs> {
  const { supabase } = deps;

  const [
    questionRes,
    criteriaRes,
    protocolRes,
    searchTermsRes,
    searchesRes,
    counterRes,
    exclusionRes,
    amendmentRes,
    synthesisRes,
    aiSugRes,
  ] = await Promise.all([
    supabase
      .from("question")
      .select("framework, question_text, fields")
      .eq("review_id", reviewId)
      .maybeSingle(),
    supabase
      .from("eligibility_criterion")
      .select("kind, text")
      .eq("review_id", reviewId)
      .order("created_at"),
    supabase
      .from("protocol")
      .select("state, locked_at")
      .eq("review_id", reviewId)
      .maybeSingle(),
    supabase
      .from("eligibility_criterion")
      .select("text")
      .eq("review_id", reviewId)
      .eq("kind", "search_term")
      .neq("ratification_state", "rejected")
      .order("created_at"),
    supabase
      .from("search")
      .select("database, record(count)")
      .eq("review_id", reviewId)
      .order("created_at", { ascending: false }),
    supabase
      .from("prisma_counter")
      .select(
        "identified, duplicates, screened, included_ts, excluded_ts, maybe_ts, included_ft, excluded_ft, passed_ts",
      )
      .eq("review_id", reviewId)
      .maybeSingle(),
    supabase
      .from("prisma_exclusion_breakdown")
      .select("reason_id, reason_label, n")
      .eq("review_id", reviewId)
      .order("n", { ascending: false }),
    supabase
      .from("protocol_amendment")
      .select("version, change, dated_at")
      .eq("review_id", reviewId)
      .order("version"),
    supabase
      .from("synthesis")
      .select("id")
      .eq("review_id", reviewId)
      .maybeSingle(),
    supabase
      .from("ai_suggestion")
      .select("target_kind, provenance, state")
      .eq("review_id", reviewId),
  ]);

  // Temas RATIFICADOS (accepted/edited) da síntese (US1) — fonte da narrativa de Resultados.
  let themes: { name: string; narrative: string }[] = [];
  const synthesisId = (synthesisRes.data as { id: string } | null)?.id;
  if (synthesisId) {
    const { data: themeRows } = await supabase
      .from("theme")
      .select("name, narrative, order")
      .eq("synthesis_id", synthesisId)
      .in("state", ["accepted", "edited"])
      .order("order");
    themes = (
      (themeRows ?? []) as { name: string; narrative: string; order: number }[]
    ).map((t) => ({
      name: t.name,
      narrative: t.narrative,
    }));
  }

  const c = counterRes.data as Record<string, number> | null;

  return {
    question: questionRes.data
      ? {
          framework: (questionRes.data as { framework: string }).framework,
          questionText: (questionRes.data as { question_text: string })
            .question_text,
          fields:
            (questionRes.data as { fields: Record<string, string> | null })
              .fields ?? {},
        }
      : null,
    criteria: (criteriaRes.data ?? []) as ReportInputs["criteria"],
    protocol: protocolRes.data
      ? {
          state: (protocolRes.data as { state: "draft" | "locked" }).state,
          lockedAt: (protocolRes.data as { locked_at: string | null })
            .locked_at,
        }
      : null,
    searchQuery: composeSuggestedQuery(
      ((searchTermsRes.data ?? []) as { text: string }[]).map((r) => r.text),
    ),
    searches: (
      (searchesRes.data ?? []) as {
        database: string;
        record: { count: number }[] | null;
      }[]
    ).map((s) => ({
      database: s.database,
      recordCount: s.record?.[0]?.count ?? 0,
    })),
    counters: {
      identified: c?.identified ?? 0,
      duplicates: c?.duplicates ?? 0,
      screened: c?.screened ?? 0,
      includedTs: c?.included_ts ?? 0,
      excludedTs: c?.excluded_ts ?? 0,
      maybeTs: c?.maybe_ts ?? 0,
      passedTs: c?.passed_ts ?? 0,
      includedFt: c?.included_ft ?? 0,
      excludedFt: c?.excluded_ft ?? 0,
    },
    exclusions: (
      (exclusionRes.data ?? []) as {
        reason_id: string;
        reason_label: string;
        n: number;
      }[]
    ).map((e) => ({
      reasonId: e.reason_id ?? "",
      reasonLabel: e.reason_label ?? "",
      n: e.n ?? 0,
    })),
    amendments: (
      (amendmentRes.data ?? []) as {
        version: number;
        change: Record<string, unknown>;
        dated_at: string;
      }[]
    ).map((a) => ({
      version: a.version,
      datedAt: a.dated_at,
      change: a.change,
    })),
    themes,
    aiSuggestions: (
      (aiSugRes.data ?? []) as {
        target_kind: string;
        provenance: { model?: string; version?: string } | null;
        state: string;
      }[]
    ).map((s) => ({
      targetKind: s.target_kind,
      model: s.provenance?.model ?? "?",
      version: s.provenance?.version ?? "?",
      state: s.state,
    })),
    optionalPhasesOff: OPTIONAL_PHASES_OFF,
  };
}

export interface ReportSectionRow {
  id: string;
  kind: SectionKind;
  content: string;
  edit_state: EditState;
  ai_suggestion_id: string | null;
  order: number;
}

/** Resolve (ou cria) a row report 1:1 da Revisão; retorna o id. */
export async function resolveReport(
  deps: Deps,
  reviewId: string,
): Promise<string> {
  const { supabase } = deps;
  const { data: existing } = await supabase
    .from("report")
    .select("id")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created, error } = await supabase
    .from("report")
    .insert({ review_id: reviewId, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (created as { id: string }).id;
}

/** Carrega report + seções (ordenadas) p/ a UI. */
export async function loadReport(
  deps: Deps,
  reviewId: string,
): Promise<{
  id: string;
  status: string;
  sections: ReportSectionRow[];
} | null> {
  const { supabase } = deps;
  const { data: report } = await supabase
    .from("report")
    .select("id, status")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!report) return null;
  const reportId = (report as { id: string }).id;
  const { data: sections, error } = await supabase
    .from("report_section")
    .select('id, kind, content, edit_state, ai_suggestion_id, "order"')
    .eq("report_id", reportId)
    .order("order");
  if (error) throw new Error(error.message);
  return {
    id: reportId,
    status: (report as { status: string }).status,
    sections: (sections ?? []) as unknown as ReportSectionRow[],
  };
}
