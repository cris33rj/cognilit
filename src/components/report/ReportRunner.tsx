"use client";

import { useState, useTransition } from "react";

interface EstimateResult {
  ok: true;
  estimate: { tokensEstimated: number; cost: Record<string, number> };
  byokMissing: boolean;
}

export function ReportRunner({
  reviewId,
  hasReport,
  onEstimate,
  onGenerate,
}: {
  reviewId: string;
  hasReport: boolean;
  onEstimate: (reviewId: string) => Promise<EstimateResult>;
  onGenerate: (reviewId: string) => Promise<{ ok: true }>;
}) {
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  return (
    <div className="space-y-2 rounded border border-line p-3">
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border border-line px-3 py-1 text-sm text-ink disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const e = await onEstimate(reviewId);
              setInfo(
                `Estimativa: ~${e.estimate.tokensEstimated.toLocaleString("pt-BR")} tokens` +
                  (e.byokMissing ? " (sem chave: modo simulado)" : ""),
              );
            })
          }
        >
          Estimar custo
        </button>
        <button
          type="button"
          className="rounded bg-ink px-3 py-1 text-sm text-paper disabled:opacity-50"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await onGenerate(reviewId);
              setInfo("Relatório gerado.");
            })
          }
        >
          {hasReport ? "Regerar tudo (com IA)" : "Gerar relatório"}
        </button>
      </div>
      {info && <p className="text-xs text-ink-soft">{info}</p>}
    </div>
  );
}
