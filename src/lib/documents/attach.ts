import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePdfUpload } from "./validate";

export interface AttachDeps {
  supabase: SupabaseClient;
}

export interface AttachInput {
  reviewId: string;
  recordId: string;
  filename: string;
  bytes: Uint8Array;
}

export type AttachResult =
  | { ok: true; documentId: string; jobId: string }
  | { ok: false; error: string };

/**
 * Valida (síncrono, §VIII), envia o binário ao bucket privado `pdfs` (path escopado
 * por Revisão, R7) e chama a RPC atômica que cria document(queued)+job+job_item+audit.
 * NÃO processa texto. O `supabase` injetado carrega a sessão do membro (RLS no Storage
 * e na RPC). Testável com client de membro.
 */
export async function attachPdfDocument(
  deps: AttachDeps,
  input: AttachInput,
): Promise<AttachResult> {
  const valid = validatePdfUpload({
    bytes: input.bytes,
    byteSize: input.bytes.byteLength,
  });
  if (!valid.ok) return { ok: false, error: valid.error };

  const documentId = crypto.randomUUID();
  const storagePath = `review/${input.reviewId}/record/${input.recordId}/${documentId}.pdf`;

  const up = await deps.supabase.storage
    .from("pdfs")
    .upload(storagePath, input.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (up.error) return { ok: false, error: up.error.message };

  const { data, error } = await deps.supabase.rpc("create_pdf_pipeline_job", {
    p_review_id: input.reviewId,
    p_record_id: input.recordId,
    p_document_id: documentId,
    p_storage_path: storagePath,
    p_filename: input.filename,
    p_byte_size: input.bytes.byteLength,
  });
  if (error) {
    // Limpeza best-effort: remove o objeto órfão para não deixar nada parcial (FR-003).
    const { error: cleanupErr } = await deps.supabase.storage
      .from("pdfs")
      .remove([storagePath]);
    if (cleanupErr) {
      console.error(
        "[attachPdfDocument] falha ao remover objeto órfão",
        storagePath,
        cleanupErr.message,
      );
    }
    return { ok: false, error: error.message };
  }

  if (!data)
    return {
      ok: false,
      error: "RPC create_pdf_pipeline_job não retornou dados.",
    };
  const out = data as { document_id: string; job_id: string };
  return { ok: true, documentId: out.document_id, jobId: out.job_id };
}
