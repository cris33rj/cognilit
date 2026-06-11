"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StudyRow } from "@/lib/extraction/queries";
import type { CostEstimate } from "@/lib/ai/llm/types";

interface EstimateResult {
  ok: true;
  itemCount: number;
  fieldCount: number;
  estimate: CostEstimate;
  byokMissing: boolean;
}

export function ExtractionBatchRunner({
  reviewId,
  candidates,
  onEstimate,
  onRun,
}: {
  reviewId: string;
  candidates: StudyRow[];
  onEstimate: (
    reviewId: string,
    recordIds: string[] | null,
  ) => Promise<EstimateResult>;
  onRun: (
    reviewId: string,
    recordIds: string[] | null,
  ) => Promise<{ ok: boolean; jobId: string; itemCount: number }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.id)),
  );
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedIds = [...selected];
  const usd = estimate?.estimate.cost.usd;

  function toggle(id: string) {
    setEstimate(null); // estimativa expira quando a seleção muda (FR-022)
    setSummary(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doEstimate() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const res = await onEstimate(reviewId, selectedIds);
        setEstimate(res);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function doRun() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await onRun(reviewId, selectedIds);
        setSummary(
          res.itemCount === 0
            ? "Nenhum estudo elegível no lote."
            : `Lote concluído: ${res.itemCount} estudo(s) processado(s).`,
        );
        setEstimate(null);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Nenhum estudo com PDF processado disponível para extração em lote.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-1.5">
            <input
              id={`batch-${c.id}`}
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
            />
            <label htmlFor={`batch-${c.id}`} className="text-sm">
              {c.title}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={doEstimate}
          disabled={pending || selectedIds.length === 0}
          className="rounded border border-accent px-3 py-1 text-xs text-accent-deep focus-visible:ring disabled:opacity-50"
        >
          Estimar custo ({selectedIds.length})
        </button>
        <button
          type="button"
          onClick={doRun}
          disabled={pending || !estimate || estimate.itemCount === 0}
          className="btn-primary disabled:opacity-50"
        >
          Confirmar e extrair em lote
        </button>
      </div>

      {estimate && (
        <div className="panel space-y-1 p-3 text-sm">
          <div>
            Estimativa: <strong>{estimate.itemCount}</strong> estudo(s) ×{" "}
            <strong>{estimate.fieldCount}</strong> campo(s) ≈{" "}
            <strong>{estimate.estimate.tokensEstimated}</strong> tokens
            {usd != null && <> · ≈ US$ {usd.toFixed(4)}</>}
          </div>
          {estimate.byokMissing && (
            <p className="text-xs text-warn">
              Nenhuma chave de IA (BYOK) configurada — a extração roda em modo
              local de demonstração. Configure a chave para uso real; a extração
              manual segue disponível.
            </p>
          )}
        </div>
      )}

      {summary && <p className="text-sm text-ink-soft">{summary}</p>}
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}
