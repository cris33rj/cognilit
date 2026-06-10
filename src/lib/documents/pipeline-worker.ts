import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import {
  extractNativeText,
  isScannedPage,
  DEFAULT_SCAN_THRESHOLD,
} from "./extract";
import {
  rasterizePage as defaultRasterize,
  type RasterizePage,
} from "./rasterize";

interface PipelineItem {
  id: string;
  payload: { document_id: string };
  review_id: string;
  attempts: number;
}

export interface PipelineWorkerDeps {
  supabase: SupabaseClient; // service-role (bypassa RLS p/ Storage + writes)
  provider: LLMProvider;
  rasterize?: RasterizePage; // injetável p/ testes (default: unpdf)
  scanThreshold?: number; // injetável p/ calibração (default: DEFAULT_SCAN_THRESHOLD)
}

export interface PipelineWorkerResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/**
 * Processa um job pdf_text_pipeline item-a-item (§VIII): baixa o PDF do Storage,
 * extrai texto nativo por página, faz OCR multimodal nas páginas escaneadas, grava
 * text_layer (origin nativo|ocr_ia) e atualiza document.processing_status + page_count.
 * Resiliente por-item/página; retomável (só pega job_item 'pending').
 */
export async function processPdfPipelineJob(
  deps: PipelineWorkerDeps,
  jobId: string,
): Promise<PipelineWorkerResult> {
  const { supabase, provider } = deps;
  const rasterize = deps.rasterize ?? defaultRasterize;
  const threshold = deps.scanThreshold ?? DEFAULT_SCAN_THRESHOLD;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: items, error } = await supabase
    .from("job_item")
    .select("id, payload, review_id, attempts")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  for (const it of (items ?? []) as PipelineItem[]) {
    const documentId = it.payload.document_id;
    try {
      await supabase
        .from("document")
        .update({ processing_status: "processing" })
        .eq("id", documentId);

      // Idempotência: limpa camadas de uma execução anterior interrompida deste
      // mesmo PDF (item ainda 'pending' após crash) antes de reextrair (retomável).
      await supabase.from("text_layer").delete().eq("document_id", documentId);

      const { data: doc, error: docErr } = await supabase
        .from("document")
        .select("storage_path")
        .eq("id", documentId)
        .single();
      if (docErr) throw new Error(docErr.message);

      const dl = await supabase.storage
        .from("pdfs")
        .download(doc!.storage_path);
      if (dl.error) throw new Error(dl.error.message);
      const bytes = new Uint8Array(await dl.data.arrayBuffer());

      const { totalPages, pages } = await extractNativeText(bytes);
      let pageFailures = 0;

      for (const p of pages) {
        try {
          let content = p.content;
          let origin: "nativo" | "ocr_ia" = "nativo";
          if (isScannedPage(p.content, threshold)) {
            const img = await rasterize(bytes, p.page);
            const ocr = await provider.ocrPage({
              imageBase64: img.imageBase64,
              mediaType: img.mediaType,
              page: p.page,
            });
            content = ocr.output.text;
            origin = "ocr_ia";
          }
          const { error: tlErr } = await supabase.from("text_layer").insert({
            review_id: it.review_id,
            document_id: documentId,
            page: p.page,
            char_start: 0,
            char_end: content.length,
            content,
            origin,
          });
          if (tlErr) throw new Error(tlErr.message);
        } catch (pageErr) {
          // Página falha não derruba o PDF (→ partial); registra para observabilidade.
          console.error(
            `[pipeline-worker] página ${p.page} falhou no documento ${documentId}:`,
            pageErr,
          );
          pageFailures += 1;
        }
      }

      const status = pageFailures > 0 ? "partial" : "text_ready";
      await supabase
        .from("document")
        .update({ processing_status: status, page_count: totalPages })
        .eq("id", documentId);

      await supabase
        .from("job_item")
        .update({ status: "done" })
        .eq("id", it.id);
    } catch (e) {
      // Falha estrutural (download/abertura do PDF): item failed + document failed.
      await supabase
        .from("document")
        .update({ processing_status: "failed" })
        .eq("id", documentId);
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: (it.attempts ?? 0) + 1,
        })
        .eq("id", it.id);
    }
  }

  const { data: counts, error: cErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const done = all.filter((i) => i.status === "done").length;
  const failed = all.filter((i) => i.status === "failed").length;
  const status =
    failed > 0 ? (done > 0 ? "completed_with_errors" : "failed") : "completed";

  await supabase
    .from("job")
    .update({
      status,
      progress: total ? Math.round((done / total) * 100) : 100,
    })
    .eq("id", jobId);

  return { job_id: jobId, status, done, failed };
}
