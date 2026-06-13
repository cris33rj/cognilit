"use client";

import { useState } from "react";
import { ThemeCard, type ThemeCardTheme } from "./ThemeCard";

interface ThemeListProps {
  reviewId: string;
  synthesisId: string;
  themes: ThemeCardTheme[];
  onAccept: (
    reviewId: string,
    themeId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onEdit: (
    reviewId: string,
    themeId: string,
    patch: { name?: string; narrative?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  onReject: (
    reviewId: string,
    themeId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onReorder: (
    reviewId: string,
    synthesisId: string,
    themeIds: string[],
  ) => Promise<{ ok: boolean; error?: string }>;
  onMerge: (
    reviewId: string,
    themeIds: string[],
    name: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onSplit: (
    reviewId: string,
    themeId: string,
    parts: { name: string; narrative?: string; findingRefs: string[] }[],
  ) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Lista ordenada de temas com controles de reordenação (cima/baixo),
 * mesclagem e divisão.
 * - Reorder: botões ↑/↓ simples (drag-and-drop não requerido).
 * - Merge: seleciona dois temas e mesclagem com nome fornecido.
 * - Split: não exposto na UI mínima (delegado ao autor via edição manual).
 */
export function ThemeList({
  reviewId,
  synthesisId,
  themes,
  onAccept,
  onEdit,
  onReject,
  onReorder,
  onMerge,
}: ThemeListProps) {
  // Local order — espelha `order` do banco; atualizamos otimisticamente.
  const sorted = [...themes].sort((a, b) => a.order - b.order);
  const [localOrder, setLocalOrder] = useState<string[]>(
    sorted.map((t) => t.id),
  );
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  // Mapa id→tema para acesso rápido
  const byId = new Map(themes.map((t) => [t.id, t]));

  async function moveTheme(id: string, direction: "up" | "down") {
    const idx = localOrder.indexOf(id);
    if (idx < 0) return;
    const newOrder = [...localOrder];
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= newOrder.length) return;
    [newOrder[idx], newOrder[swap]] = [newOrder[swap]!, newOrder[idx]!];
    setLocalOrder(newOrder);
    setReorderError(null);
    const result = await onReorder(reviewId, synthesisId, newOrder);
    if (!result.ok) {
      setReorderError(result.error ?? "Falha ao reordenar.");
      // rollback
      setLocalOrder(localOrder);
    }
  }

  function toggleMergeSelect(id: string) {
    setMergeSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleMerge() {
    if (mergeSelected.size < 2 || !mergeName.trim()) return;
    setMerging(true);
    setMergeError(null);
    const result = await onMerge(
      reviewId,
      [...mergeSelected],
      mergeName.trim(),
    );
    setMerging(false);
    if (!result.ok) {
      setMergeError(result.error ?? "Falha ao mesclar temas.");
    } else {
      setMergeSelected(new Set());
      setMergeName("");
    }
  }

  return (
    <div className="space-y-4">
      {/* Merge toolbar */}
      {mergeSelected.size >= 2 && (
        <div className="flex items-center gap-2 rounded border border-warn bg-warn-wash px-3 py-2 text-xs">
          <span className="text-ink-soft">
            {mergeSelected.size} temas selecionados para mescla
          </span>
          <input
            type="text"
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
            placeholder="Nome do tema resultante"
            aria-label="Nome do tema resultante da mesclagem"
            className="flex-1 rounded border border-line px-2 py-0.5 text-xs focus-visible:ring"
          />
          <button
            type="button"
            onClick={handleMerge}
            disabled={merging || !mergeName.trim()}
            className="rounded border border-warn px-2 py-0.5 text-xs text-warn focus-visible:ring disabled:opacity-40"
          >
            {merging ? "Mesclando…" : "Mesclar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMergeSelected(new Set());
              setMergeName("");
            }}
            className="rounded border border-line px-2 py-0.5 text-xs text-ink-faint focus-visible:ring"
          >
            Cancelar
          </button>
        </div>
      )}

      {mergeError && (
        <p className="text-xs text-error" role="alert">
          {mergeError}
        </p>
      )}
      {reorderError && (
        <p className="text-xs text-error" role="alert">
          {reorderError}
        </p>
      )}

      {/* Theme cards */}
      {localOrder.map((id, idx) => {
        const theme = byId.get(id);
        if (!theme) return null;
        return (
          <div key={id} className="flex gap-2">
            {/* Reorder controls */}
            <div className="flex flex-col gap-0.5 pt-4">
              <button
                type="button"
                aria-label={`Mover '${theme.name}' para cima`}
                disabled={idx === 0}
                onClick={() => moveTheme(id, "up")}
                className="rounded border border-line px-1 py-0.5 text-xs text-ink-faint focus-visible:ring disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Mover '${theme.name}' para baixo`}
                disabled={idx === localOrder.length - 1}
                onClick={() => moveTheme(id, "down")}
                className="rounded border border-line px-1 py-0.5 text-xs text-ink-faint focus-visible:ring disabled:opacity-30"
              >
                ↓
              </button>
            </div>

            {/* Merge checkbox */}
            <div className="pt-4">
              <input
                type="checkbox"
                id={`merge-${id}`}
                aria-label={`Selecionar '${theme.name}' para mescla`}
                checked={mergeSelected.has(id)}
                onChange={() => toggleMergeSelect(id)}
                className="h-3.5 w-3.5 rounded border-line accent-accent"
              />
            </div>

            {/* Card */}
            <div className="flex-1">
              <ThemeCard
                reviewId={reviewId}
                synthesisId={synthesisId}
                theme={theme}
                onAccept={onAccept}
                onEdit={onEdit}
                onReject={onReject}
                onReorder={onReorder}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
