"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SuggestionChip } from "@/components/ai/SuggestionChip";
import { ShortcutLegend } from "@/components/workbench/ShortcutLegend";
import { DENSITIES, type Density } from "@/lib/screening/config";
import {
  applyQueueView,
  parseQueueState,
  serializeQueueState,
  type QueueViewState,
} from "@/lib/screening/queue-url";
import type {
  ExclusionReason,
  QueueRow,
  ScreeningStage,
} from "@/lib/screening/queries";

type Decision = "include" | "exclude" | "maybe";

export interface ScreeningQueueProps {
  reviewId: string;
  stage: ScreeningStage;
  loadQueue: (reviewId: string, stage: ScreeningStage) => Promise<QueueRow[]>;
  loadReasons: (reviewId: string) => Promise<ExclusionReason[]>;
  onAddReason: (label: string) => Promise<{ ok: boolean; id?: string }>;
  onRemoveReason: (reasonId: string) => Promise<{ ok: boolean }>;
  onDecide: (input: {
    recordId: string;
    stage: ScreeningStage;
    decision: Decision;
    exclusionReasonId?: string | null;
    aiSuggestionId?: string | null;
  }) => Promise<{ ok: boolean }>;
  onReverse: (decisionId: string) => Promise<{ ok: boolean }>;
}

export function ScreeningQueue({
  reviewId,
  stage,
  loadQueue,
  loadReasons,
  onAddReason,
  onRemoveReason,
  onDecide,
  onReverse,
}: ScreeningQueueProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(
    () => parseQueueState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  function setView(next: QueueViewState) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("qfilter");
    params.delete("qsort");
    for (const [k, v] of Object.entries(serializeQueueState(next)))
      params.set(k, v);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const [density, setDensity] = useState<Density>("comfortable");
  const [focusIdx, setFocusIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingExclude, setPendingExclude] = useState<string | null>(null);
  const [reasonId, setReasonId] = useState<string>("");
  const [newReason, setNewReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const queue = useQuery({
    queryKey: ["screening", stage, reviewId],
    queryFn: () => loadQueue(reviewId, stage),
  });
  const reasons = useQuery({
    queryKey: ["screening", "reasons", reviewId],
    queryFn: () => loadReasons(reviewId),
    enabled: stage === "full_text",
  });

  const rows = useMemo(() => queue.data ?? [], [queue.data]);

  // Filtro + ordenação reabríveis pela URL (FR-037); a decisão considerada
  // depende do estágio (título/resumo ⇒ tsDecision; texto completo ⇒ ftDecision).
  const visibleRows = useMemo(
    () =>
      applyQueueView(
        rows,
        view,
        (r) => ({
          decision:
            (stage === "full_text" ? r.ftDecision : r.tsDecision) ?? null,
          aiConfidence: r.ai?.confidence ?? null,
        }),
        (r) => ({ title: r.title, year: r.year }),
      ),
    [rows, view, stage],
  );

  const rowHeight = DENSITIES.find((d) => d.key === density)?.rowHeight ?? 56;

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  async function decideOne(
    row: QueueRow,
    decision: Decision,
  ): Promise<boolean> {
    // Texto completo + excluir ⇒ exige motivo antes de confirmar (FR-025).
    if (stage === "full_text" && decision === "exclude" && !reasonId) {
      setPendingExclude(row.recordId);
      return false;
    }
    await onDecide({
      recordId: row.recordId,
      stage,
      decision,
      exclusionReasonId:
        stage === "full_text" && decision === "exclude" ? reasonId : null,
      aiSuggestionId: row.ai?.suggestionId ?? null,
    });
    return true;
  }

  async function decide(row: QueueRow, decision: Decision) {
    setError(null);
    try {
      const ok = await decideOne(row, decision);
      if (ok) {
        setPendingExclude(null);
        setReasonId("");
        await qc.invalidateQueries({ queryKey: ["screening"] });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao registrar a decisão.",
      );
    }
  }

  // Ações em lote (FR-039): mesma regra por item.
  async function decideBatch(decision: Decision) {
    setError(null);
    try {
      for (const row of visibleRows.filter((r) => selected.has(r.recordId))) {
        const ok = await decideOne(row, decision);
        if (!ok) return; // abre seletor de motivo; usuário reexecuta
      }
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ["screening"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na ação em lote.");
    }
  }

  async function handleReverse(decisionId: string) {
    setError(null);
    try {
      await onReverse(decisionId);
      await qc.invalidateQueries({ queryKey: ["screening"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao desfazer a decisão.");
    }
  }

  // Gestão de motivos de exclusão derivados/genéricos/manuais (Fatia 8).
  async function handleAddReason() {
    const label = newReason.trim();
    if (!label) return;
    setError(null);
    try {
      await onAddReason(label);
      setNewReason("");
      await qc.invalidateQueries({
        queryKey: ["screening", "reasons", reviewId],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao adicionar o motivo.");
    }
  }

  async function handleRemoveReason(reasonToRemove: string) {
    setError(null);
    try {
      await onRemoveReason(reasonToRemove);
      await qc.invalidateQueries({
        queryKey: ["screening", "reasons", reviewId],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover o motivo.");
    }
  }

  function toggleSelect(recordId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }

  // Mantém o foco dentro dos limites quando o filtro/ordenação muda a lista.
  useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(0, visibleRows.length - 1)));
  }, [visibleRows.length]);

  // Teclado-first (FR-023/028): navegação + decisão + seleção sem mouse.
  // Opera sobre a lista visível (filtrada/ordenada) para manter coerência.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (visibleRows.length === 0) return;
      const row = visibleRows[focusIdx];
      if (!row) return;
      if (ev.key === "j")
        setFocusIdx((i) => Math.min(i + 1, visibleRows.length - 1));
      else if (ev.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (ev.key === "x") toggleSelect(row.recordId);
      else if (ev.key === "i") void decide(row, "include");
      else if (ev.key === "e") void decide(row, "exclude");
      else if (ev.key === "d" && stage === "title_abstract")
        void decide(row, "maybe");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, focusIdx, stage, reasonId]);

  useEffect(() => {
    if (visibleRows.length)
      virtualizer.scrollToIndex(focusIdx, { align: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <ShortcutLegend />
        <div className="flex items-center gap-3">
          {/* Filtro + ordenação reabríveis pela URL (FR-037) */}
          <div
            className="flex items-center gap-2 text-sm"
            role="group"
            aria-label="Filtro e ordenação da fila"
          >
            <label>
              Filtrar{" "}
              <select
                aria-label="Filtrar a fila"
                value={view.filter}
                onChange={(e) =>
                  setView({
                    ...view,
                    filter: e.target.value as QueueViewState["filter"],
                  })
                }
                className="control"
              >
                <option value="all">Todos</option>
                <option value="undecided">Sem decisão</option>
                <option value="included">Incluídos</option>
                <option value="excluded">Excluídos</option>
                <option value="maybe">Em dúvida</option>
                <option value="ai_suggested">Com sugestão de IA</option>
              </select>
            </label>
            <label>
              Ordenar{" "}
              <select
                aria-label="Ordenar a fila"
                value={view.sort}
                onChange={(e) =>
                  setView({
                    ...view,
                    sort: e.target.value as QueueViewState["sort"],
                  })
                }
                className="control"
              >
                <option value="default">Padrão</option>
                <option value="title">Título</option>
                <option value="year">Ano</option>
                <option value="ai_confidence">Confiança da IA</option>
              </select>
            </label>
          </div>
          <label className="text-sm">
            Densidade{" "}
            <select
              aria-label="Densidade da fila"
              value={density}
              onChange={(e) => setDensity(e.target.value as Density)}
              className="control"
            >
              {DENSITIES.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Barra de ações em lote (FR-039) */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded border bg-paper-2 p-2 text-sm">
          <span>{selected.size} selecionado(s):</span>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void decideBatch("include")}
          >
            Incluir selecionados
          </button>
          <button
            type="button"
            className="rounded border border-line px-2 py-1 text-ink-soft"
            onClick={() => void decideBatch("exclude")}
          >
            Excluir selecionados
          </button>
          {stage === "title_abstract" && (
            <button
              type="button"
              className="rounded border border-line px-2 py-1 text-ink-soft"
              onClick={() => void decideBatch("maybe")}
            >
              Dúvida em lote
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Gestão de motivos de exclusão — só no Texto completo (Fatia 8).
          Motivos derivados de critérios trazem marcador discreto de origem,
          reusando o vocabulário visual de IA (SC-005). */}
      {stage === "full_text" && (
        <section className="panel text-sm" aria-label="Motivos de exclusão">
          <h3 className="panel-title">Motivos de exclusão</h3>
          <ul
            className="flex flex-col gap-1"
            aria-label="Lista de motivos de exclusão"
          >
            {(reasons.data ?? []).map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-1">
                  <span>{r.label}</span>
                  {r.origin === "criterion" && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-wash px-2 py-0.5 text-xs font-medium text-accent-deep"
                      data-ai-state="inferred"
                      title="Derivado de um critério de elegibilidade"
                    >
                      <span aria-hidden>✦</span>
                      do critério
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="rounded border px-2 py-0.5 text-xs text-ink-soft hover:bg-paper-2"
                  aria-label={`Remover motivo ${r.label}`}
                  onClick={() => void handleRemoveReason(r.id)}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              className="control flex-1"
              aria-label="Novo motivo de exclusão"
              placeholder="Adicionar motivo…"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddReason();
                }
              }}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={!newReason.trim()}
              onClick={() => void handleAddReason()}
            >
              Adicionar
            </button>
          </div>
        </section>
      )}

      {/* Seletor de motivo de exclusão — obrigatório no Texto completo (FR-025) */}
      {stage === "full_text" && pendingExclude && (
        <div className="rounded border border-warn bg-accent-wash p-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <span>Motivo da exclusão</span>
              <select
                aria-label="Motivo da exclusão"
                value={reasonId}
                onChange={(e) => setReasonId(e.target.value)}
                className="control"
              >
                <option value="">Selecione…</option>
                {(reasons.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!reasonId}
              onClick={() => {
                const row = rows.find((r) => r.recordId === pendingExclude);
                if (row && reasonId) void decide(row, "exclude");
              }}
              className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-40"
            >
              Confirmar exclusão
            </button>
          </div>
        </div>
      )}

      {/* Grade virtualizada (FR-028, FR-041) */}
      <div
        ref={parentRef}
        role="grid"
        aria-label="Fila de triagem"
        tabIndex={0}
        className="h-[60vh] overflow-auto rounded border focus:outline focus:outline-2 focus:outline-accent"
      >
        {queue.isLoading ? (
          <p className="p-3 text-sm text-ink-faint">Carregando…</p>
        ) : visibleRows.length === 0 ? (
          <p className="p-3 text-sm text-ink-faint">
            Nenhum registro nesta fila.
          </p>
        ) : (
          <div
            role="rowgroup"
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((v) => {
              const row = visibleRows[v.index];
              if (!row) return null;
              const focused = v.index === focusIdx;
              const isSelected = selected.has(row.recordId);
              return (
                <div
                  key={row.recordId}
                  role="row"
                  aria-selected={isSelected}
                  aria-current={focused ? true : undefined}
                  onClick={() => setFocusIdx(v.index)}
                  className={`absolute left-0 top-0 flex w-full items-center gap-3 border-b px-3 ${
                    focused
                      ? "bg-accent-wash outline outline-2 outline-accent"
                      : ""
                  }`}
                  style={{
                    height: v.size,
                    transform: `translateY(${v.start}px)`,
                  }}
                >
                  {/* Checkbox de seleção para ações em lote (FR-039) */}
                  <input
                    type="checkbox"
                    role="gridcell"
                    aria-label={`Selecionar ${row.title}`}
                    checked={isSelected}
                    onChange={() => toggleSelect(row.recordId)}
                  />

                  {/* Título e ano */}
                  <span role="gridcell" className="flex-1 truncate text-sm">
                    {row.title}{" "}
                    <span className="text-xs text-ink-faint">
                      ({row.year ?? "—"})
                    </span>
                  </span>

                  {/* Decisão / estado atual */}
                  <span role="gridcell" className="text-xs text-ink-soft">
                    {row.tsDecision ?? row.ftDecision ?? row.corpusState}
                  </span>

                  {/* Sugestão de IA — visualmente distinta de dado humano (SC-005).
                      SuggestionChip aceita apenas { state } (sem children); o
                      texto da recomendação e razão são exibidos junto ao chip. */}
                  {row.ai && (
                    <span
                      role="gridcell"
                      className="flex items-center gap-1"
                      title={row.ai.reason ?? undefined}
                    >
                      <SuggestionChip state={row.ai.state} />
                      <span className="text-xs text-ink-soft">
                        {row.ai.recommendation === "include"
                          ? "incluir"
                          : "excluir"}
                        {row.ai.reason ? ` — ${row.ai.reason}` : ""}
                      </span>
                    </span>
                  )}

                  {/* Desfazer decisão — disponível quando há decisão não revertida (FR-026) */}
                  {row.decisionId && (
                    <span role="gridcell">
                      <button
                        type="button"
                        className="rounded border px-2 py-0.5 text-xs text-ink-soft hover:bg-paper-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleReverse(row.decisionId!);
                        }}
                      >
                        Desfazer
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
