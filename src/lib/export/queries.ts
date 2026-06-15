import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RECORD_DETAIL_SELECT,
  toRecordDetail,
  type RawRecordRow,
  type RecordDetailData,
} from "@/lib/record/queries";
import { loadReport, type ReportSectionRow } from "@/lib/report/queries";
import {
  buildCharacteristicsTable,
  type CharacteristicsTable,
} from "@/lib/prisma/characteristics";
import {
  loadPrismaChecklist,
  type ChecklistItem,
} from "@/lib/prisma/checklist";

export const EXPORT_FORMATS = [
  "docx",
  "pdf",
  "md",
  "bibtex",
  "ris",
  "prisma_svg",
  "prisma_png",
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

interface Deps {
  supabase: SupabaseClient;
}

/** Registros included_ft com metadados bibliográficos ricos (FR-021). */
export async function listIncludedFtRecordsDetail(
  deps: Deps,
  reviewId: string,
): Promise<RecordDetailData[]> {
  const { data, error } = await deps.supabase
    .from("record")
    .select(RECORD_DETAIL_SELECT)
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawRecordRow[]).map(toRecordDetail);
}

export interface MarkdownInput {
  reviewTitle: string;
  sections: Array<{ kind: string; content: string }>;
  characteristics: CharacteristicsTable;
  checklist: ChecklistItem[];
}

/** Carrega tudo o que o Markdown precisa (seções + características + checklist). */
export async function loadExportInputs(
  deps: Deps,
  reviewId: string,
): Promise<MarkdownInput> {
  const [reportData, characteristics, checklist, reviewRow] = await Promise.all(
    [
      loadReport(deps, reviewId),
      buildCharacteristicsTable(deps, reviewId),
      loadPrismaChecklist(deps, reviewId),
      deps.supabase
        .from("review")
        .select("title")
        .eq("id", reviewId)
        .maybeSingle(),
    ],
  );
  const sections = (reportData?.sections ?? ([] as ReportSectionRow[])).map(
    (s) => ({ kind: s.kind as string, content: s.content }),
  );
  return {
    reviewTitle:
      (reviewRow.data as { title?: string } | null)?.title ?? "Revisão",
    sections,
    characteristics,
    checklist,
  };
}
