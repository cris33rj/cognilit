import { createClient } from "@/lib/supabase/server";
import type { SourceFormat } from "@shared/import/types";
import { extractRawFields } from "./raw-fields";

/** Select reusado pelo teste de integração (deve casar com a query abaixo). */
export const RECORD_DETAIL_SELECT = "id, source_format, metadata, raw";

interface RecordMetadata {
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  doi?: string | null;
  abstract?: string | null;
  language?: string | null;
}

export interface RawRecordRow {
  id: string;
  source_format: SourceFormat;
  metadata: RecordMetadata | null;
  raw: Record<string, unknown> | null;
}

export interface RecordDetailData {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  language: string | null;
  abstract: string | null;
  journal: string | null;
  keywords: string[];
  volume: string | null;
  issue: string | null;
  pages: string | null;
}

/** Funde metadata normalizado + campos extraídos do raw (puro, testável). */
export function toRecordDetail(row: RawRecordRow): RecordDetailData {
  const m = row.metadata ?? {};
  const extra = extractRawFields(row.source_format, row.raw ?? {});
  return {
    id: row.id,
    title: m.title ?? "(sem título)",
    authors: m.authors ?? [],
    year: m.year ?? null,
    doi: m.doi ?? null,
    language: m.language ?? null,
    abstract: m.abstract ?? null,
    journal: extra.journal,
    keywords: extra.keywords,
    volume: extra.volume,
    issue: extra.issue,
    pages: extra.pages,
  };
}

/** Detalhe rico de um registro (RLS por membership via server client). */
export async function getRecordDetail(
  recordId: string,
): Promise<RecordDetailData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("record")
    .select(RECORD_DETAIL_SELECT)
    .eq("id", recordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toRecordDetail(data as unknown as RawRecordRow);
}
