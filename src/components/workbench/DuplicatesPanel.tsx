"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExactRemoval, FuzzyCandidate } from "@/lib/dedup/queries";

export interface DuplicatesPanelProps {
  reviewId: string;
  loadExactRemovals: (reviewId: string) => Promise<ExactRemoval[]>;
  loadFuzzyCandidates: (reviewId: string) => Promise<FuzzyCandidate[]>;
  onDecide: (input: {
    recordA: string;
    recordB: string;
    outcome: "merged" | "kept_distinct";
    similarity: number;
  }) => Promise<{ ok: boolean }>;
  onReverse: (decisionId: string) => Promise<{ ok: boolean }>;
}

export function DuplicatesPanel({
  reviewId,
  loadExactRemovals,
  loadFuzzyCandidates,
  onDecide,
  onReverse,
}: DuplicatesPanelProps) {
  const qc = useQueryClient();
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const exact = useQuery({
    queryKey: ["dedup", "exact", reviewId],
    queryFn: () => loadExactRemovals(reviewId),
  });
  const fuzzy = useQuery({
    queryKey: ["dedup", "fuzzy", reviewId],
    queryFn: () => loadFuzzyCandidates(reviewId),
  });

  const refetchAll = () => qc.invalidateQueries({ queryKey: ["dedup"] });

  async function decide(
    c: FuzzyCandidate,
    outcome: "merged" | "kept_distinct",
  ) {
    if (acting) return;
    setActing(true);
    setActionError(null);
    try {
      await onDecide({
        recordA: c.recordAId,
        recordB: c.recordBId,
        outcome,
        similarity: c.similarity,
      });
      await refetchAll();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Falha ao registrar a decisão.",
      );
    } finally {
      setActing(false);
    }
  }

  async function reverse(decisionId: string) {
    if (acting) return;
    setActing(true);
    setActionError(null);
    try {
      await onReverse(decisionId);
      await refetchAll();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Falha ao desfazer.");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}
      <section aria-labelledby="fuzzy-h">
        <h2 id="fuzzy-h" className="mb-2 text-sm font-semibold">
          Pares prováveis para confirmar
        </h2>
        {fuzzy.isLoading ? (
          <p className="text-sm text-ink-faint">Carregando…</p>
        ) : (fuzzy.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-faint">Nenhum par pendente.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {fuzzy.data!.map((c) => (
              <li
                key={`${c.recordAId}:${c.recordBId}`}
                className="rounded border p-3"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">{c.titleA}</p>
                    <p className="text-xs text-ink-faint">
                      Ano: {c.yearA ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{c.titleB}</p>
                    <p className="text-xs text-ink-faint">
                      Ano: {c.yearB ?? "—"}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  Similaridade: {(c.similarity * 100).toFixed(0)}%
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary disabled:opacity-50"
                    disabled={acting}
                    onClick={() => decide(c, "merged")}
                  >
                    Mesma (mesclar)
                  </button>
                  <button
                    type="button"
                    className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                    disabled={acting}
                    onClick={() => decide(c, "kept_distinct")}
                  >
                    Distintas
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="exact-h">
        <h2 id="exact-h" className="mb-2 text-sm font-semibold">
          Exatas removidas automaticamente
        </h2>
        {exact.isLoading ? (
          <p className="text-sm text-ink-faint">Carregando…</p>
        ) : (exact.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-ink-faint">Nenhuma remoção registrada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {exact.data!.map((r) => (
              <li
                key={r.decisionId}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <span>
                  Removido: <strong>{r.removedTitle}</strong> (mantido:{" "}
                  {r.keptTitle})
                </span>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                  disabled={acting}
                  onClick={() => reverse(r.decisionId)}
                >
                  Desfazer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
