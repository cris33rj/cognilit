import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionKind } from "./types";
import { buildDeterministicSections } from "./sections";
import { loadReportInputs, resolveReport } from "./queries";

export interface RegenerateResult {
  regenerated: SectionKind[];
  preserved: SectionKind[];
}

/** Reescreve as seções determinísticas do estado atual; preserva human_edited (FR-016). */
export async function regenerateDeterministicSections(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<RegenerateResult> {
  const { supabase } = deps;
  const reportId = await resolveReport({ supabase }, reviewId);
  const inputs = await loadReportInputs({ supabase }, reviewId);

  const regenerated: SectionKind[] = [];
  const preserved: SectionKind[] = [];

  for (const sec of buildDeterministicSections(inputs)) {
    const { data: existing } = await supabase
      .from("report_section")
      .select("id, edit_state")
      .eq("report_id", reportId)
      .eq("kind", sec.kind)
      .maybeSingle();

    if (
      existing &&
      (existing as { edit_state: string }).edit_state === "human_edited"
    ) {
      preserved.push(sec.kind);
      continue;
    }

    if (existing) {
      await supabase
        .from("report_section")
        .update({
          content: sec.content,
          edit_state: "deterministic",
          order: sec.order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existing as { id: string }).id);
    } else {
      await supabase.from("report_section").insert({
        review_id: reviewId,
        report_id: reportId,
        kind: sec.kind,
        content: sec.content,
        edit_state: "deterministic",
        order: sec.order,
      });
    }

    regenerated.push(sec.kind);
  }

  return { regenerated, preserved };
}
