import type { SupabaseClient } from "@supabase/supabase-js";

export interface DocumentRow {
  id: string;
  filename: string;
  byte_size: number;
  processing_status:
    | "queued"
    | "processing"
    | "text_ready"
    | "partial"
    | "failed";
  created_at: string;
}

/** PDFs de um estudo, mais novos primeiro (RLS escopa por membro). */
export async function listDocuments(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordId: string,
): Promise<DocumentRow[]> {
  const { data, error } = await deps.supabase
    .from("document")
    .select("id, filename, byte_size, processing_status, created_at")
    .eq("review_id", reviewId)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentRow[];
}
