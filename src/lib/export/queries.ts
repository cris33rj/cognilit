import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RECORD_DETAIL_SELECT,
  toRecordDetail,
  type RawRecordRow,
  type RecordDetailData,
} from "@/lib/record/queries";

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
