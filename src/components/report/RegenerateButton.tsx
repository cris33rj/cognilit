"use client";

import { useState, useTransition } from "react";

interface RegenerateResult {
  ok: true;
  regenerated: string[];
  preserved: string[];
}

export function RegenerateButton({
  reviewId,
  onRegenerate,
}: {
  reviewId: string;
  onRegenerate: (reviewId: string) => Promise<RegenerateResult>;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="rounded border border-line px-3 py-1 text-sm text-ink disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await onRegenerate(reviewId);
            if (r.ok) {
              setMsg(
                `Regeneradas: ${r.regenerated.join(", ") || "nenhuma"}.` +
                  (r.preserved.length
                    ? ` Preservadas (editadas): ${r.preserved.join(", ")}.`
                    : ""),
              );
            }
          })
        }
      >
        {pending ? "Regenerando…" : "Atualizar seções factuais"}
      </button>
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
