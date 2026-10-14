"use client";

import { useState, useTransition } from "react";

const EDITABLE = new Set<string>(["methods", "discussion", "conclusion"]);

export function SectionEditor({
  reviewId,
  sectionId,
  kind,
  initial,
  onEdit,
}: {
  reviewId: string;
  sectionId: string;
  kind: string;
  initial: string;
  onEdit: (
    reviewId: string,
    sectionId: string,
    content: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [content, setContent] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!EDITABLE.has(kind)) {
    return (
      <article className="prose prose-sm max-w-none whitespace-pre-wrap text-ink">
        {initial}
      </article>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        className="w-full min-h-40 rounded border border-line p-2 font-mono text-sm text-ink bg-paper-card"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button
        type="button"
        className="rounded bg-ink px-3 py-1 text-sm text-paper disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await onEdit(reviewId, sectionId, content);
            setMsg(
              r.ok ? "Seção salva (editada pelo humano)." : `Erro: ${r.error}`,
            );
          })
        }
      >
        {pending ? "Salvando…" : "Salvar edição"}
      </button>
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
