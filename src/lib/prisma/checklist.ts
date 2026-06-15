import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionKind } from "@/lib/report/types";
import { PRISMA_2020_ITEMS, type ChecklistSeedItem } from "./checklist-items";

export type ChecklistStatus = "met" | "pending" | "not_applicable";

export interface ChecklistItem {
  itemCode: string;
  label: string;
  sectionRef: string | null;
  status: ChecklistStatus;
}

/** Sinais do estado do relatório que decidem a cobertura de cada item. */
export interface ChecklistCoverageInputs {
  /** Por kind: a seção existe e tem conteúdo não-vazio. */
  sections: Record<SectionKind, boolean>;
  /** Há contadores PRISMA (fluxograma de seleção disponível). */
  hasCounters: boolean;
  /** Há ≥1 estudo included_ft com ≥1 valor de extração ratificado. */
  hasCharacteristics: boolean;
  /** Fases opcionais desligadas (v1: ambas true — D19). */
  optionalPhasesOff: { risk_of_bias: boolean; certainty: boolean };
}

/** Pura: aplica a regra de cobertura de cada item ao estado do relatório. */
export function deriveChecklist(
  items: ChecklistSeedItem[],
  inputs: ChecklistCoverageInputs,
): ChecklistItem[] {
  return items.map((item) => {
    let status: ChecklistStatus;
    switch (item.rule.type) {
      case "section":
        status = inputs.sections[item.rule.kind] ? "met" : "pending";
        break;
      case "study_selection":
        status = inputs.hasCounters ? "met" : "pending";
        break;
      case "characteristics":
        status = inputs.hasCharacteristics ? "met" : "pending";
        break;
      case "optional_off":
        // Fase desligada → declara não-aplicável (D19). Se ligada no futuro: pending.
        status = inputs.optionalPhasesOff[item.rule.phase]
          ? "not_applicable"
          : "pending";
        break;
      case "manual":
        status = "pending";
        break;
    }
    return {
      itemCode: item.itemCode,
      label: item.label,
      sectionRef: item.sectionRef,
      status,
    };
  });
}

interface Deps {
  supabase: SupabaseClient;
}

const SECTION_KINDS: SectionKind[] = [
  "methods",
  "results",
  "discussion",
  "conclusion",
  "ai_declaration",
  "deviations",
];

/** IO: carrega o estado do relatório e deriva o checklist (sem persistir). */
export async function computePrismaChecklist(
  deps: Deps,
  reviewId: string,
): Promise<ChecklistItem[]> {
  const { supabase } = deps;

  const [{ data: sectionRows }, { data: counter }, { data: valueRows }] =
    await Promise.all([
      supabase
        .from("report_section")
        .select("kind, content")
        .eq("review_id", reviewId),
      supabase
        .from("prisma_counter")
        .select("identified")
        .eq("review_id", reviewId)
        .maybeSingle(),
      supabase
        .from("extraction_value")
        .select("id")
        .eq("review_id", reviewId)
        .in("state", ["accepted", "edited"])
        .limit(1),
    ]);

  const sections = Object.fromEntries(
    SECTION_KINDS.map((k) => [k, false]),
  ) as Record<SectionKind, boolean>;
  for (const r of (sectionRows ?? []) as {
    kind: SectionKind;
    content: string;
  }[]) {
    if ((r.content ?? "").trim().length > 0) sections[r.kind] = true;
  }

  const inputs: ChecklistCoverageInputs = {
    sections,
    hasCounters:
      ((counter as { identified?: number } | null)?.identified ?? 0) > 0,
    hasCharacteristics: (valueRows ?? []).length > 0,
    optionalPhasesOff: { risk_of_bias: true, certainty: true }, // D19 — ambas OFF na v1
  };

  return deriveChecklist(PRISMA_2020_ITEMS, inputs);
}

/** IO: computa e grava o snapshot (upsert por (review_id, item_code)). */
export async function snapshotPrismaChecklist(
  deps: Deps,
  reviewId: string,
): Promise<ChecklistItem[]> {
  const { supabase } = deps;
  const items = await computePrismaChecklist(deps, reviewId);
  const now = new Date().toISOString();
  const { error } = await supabase.from("prisma_checklist_item").upsert(
    items.map((i) => ({
      review_id: reviewId,
      item_code: i.itemCode,
      label: i.label,
      section_ref: i.sectionRef,
      status: i.status,
      computed_at: now,
    })),
    { onConflict: "review_id,item_code" },
  );
  if (error) throw new Error(error.message);
  return items;
}

/** IO: lê o snapshot persistido (para a UI). */
export async function loadPrismaChecklist(
  deps: Deps,
  reviewId: string,
): Promise<ChecklistItem[]> {
  const { supabase } = deps;
  const { data, error } = await supabase
    .from("prisma_checklist_item")
    .select("item_code, label, section_ref, status")
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  // Ordena numericamente ("2" antes de "10").
  return (
    (data ?? []) as {
      item_code: string;
      label: string;
      section_ref: string | null;
      status: ChecklistStatus;
    }[]
  )
    .map((r) => ({
      itemCode: r.item_code,
      label: r.label,
      sectionRef: r.section_ref,
      status: r.status,
    }))
    .sort((a, b) => Number(a.itemCode) - Number(b.itemCode));
}
