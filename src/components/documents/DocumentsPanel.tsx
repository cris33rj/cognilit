"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentRow } from "@/lib/documents/queries";

const STATUS_LABEL: Record<DocumentRow["processing_status"], string> = {
  queued: "enfileirado",
  processing: "processando",
  text_ready: "texto pronto",
  partial: "parcial",
  failed: "falhou",
};

const PENDING = new Set(["queued", "processing"]);

export interface DocumentsPanelProps {
  reviewId: string;
  recordId: string | null;
  loadDocuments: (reviewId: string, recordId: string) => Promise<DocumentRow[]>;
  onAttach: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  onRunPdfPipeline?: () => Promise<{ ok: boolean }>;
}

/**
 * Afordância de anexo de PDF no modo Texto completo (US1). Estende o workbench sem
 * refragmentar a triagem (Princípio V). Lista + polling de status enquanto há item
 * não-terminal (espelha JobProgress). SEM vocabulário de IA (não é sugestão).
 */
export function DocumentsPanel({
  reviewId,
  recordId,
  loadDocuments,
  onAttach,
  onRunPdfPipeline,
}: DocumentsPanelProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const docs = useQuery({
    queryKey: ["documents", reviewId, recordId],
    queryFn: () => loadDocuments(reviewId, recordId as string),
    enabled: !!recordId,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((d) => PENDING.has(d.processing_status))
        ? 1000
        : false,
  });

  async function handleFile(file: File) {
    if (!recordId) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("recordId", recordId);
      fd.set("file", file);
      const res = await onAttach(fd);
      if (!res.ok) setError(res.error ?? "Falha ao anexar o PDF.");
      else {
        await qc.invalidateQueries({
          queryKey: ["documents", reviewId, recordId],
        });
        if (onRunPdfPipeline) {
          onRunPdfPipeline().catch((err) => {
            // Disparo do pipeline falhou; o polling de status não inicia. Observável p/ Sentry.
            console.error("[pdf-pipeline] disparo falhou:", err);
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao anexar o PDF.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const pendingCount = (docs.data ?? []).filter((d) =>
    PENDING.has(d.processing_status),
  ).length;

  return (
    <aside
      className="panel flex w-[360px] shrink-0 flex-col gap-3 self-start"
      aria-labelledby="docs-panel-heading"
    >
      <h2 id="docs-panel-heading" className="panel-title">
        PDFs do estudo
      </h2>
      {!recordId ? (
        <p className="text-sm text-ink-faint">
          Selecione um registro para anexar PDFs.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              aria-label="Anexar PDF"
              aria-describedby="docs-attach-error"
              aria-invalid={!!error}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="text-sm"
            />
            <span aria-live="polite" className="text-xs text-ink-faint">
              {busy ? "enviando…" : ""}
            </span>
          </div>
          <p
            id="docs-attach-error"
            role="alert"
            className="text-sm text-red-600"
          >
            {error ?? ""}
          </p>
          {docs.isLoading ? (
            <p className="text-sm text-ink-faint">Carregando…</p>
          ) : (docs.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-faint">Nenhum PDF anexado.</p>
          ) : (
            <ul
              className="flex flex-col gap-1 text-sm"
              aria-label="Lista de PDFs"
            >
              {(docs.data ?? []).map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 truncate text-ink">
                    {d.filename}
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {STATUS_LABEL[d.processing_status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p aria-live="polite" className="sr-only">
            {pendingCount > 0
              ? `${pendingCount} PDF${pendingCount > 1 ? "s" : ""} em processamento.`
              : ""}
          </p>
        </>
      )}
    </aside>
  );
}
