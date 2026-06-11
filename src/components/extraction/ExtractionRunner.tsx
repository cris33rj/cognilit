"use client";

import { useState, useTransition } from "react";
import type { SuggestionState } from "@/lib/ai/llm/types";
import type {
  ExtractionFieldRow,
  ExtractionValueView,
} from "@/lib/extraction/queries";
import { SuggestionChip } from "@/components/ai/SuggestionChip";
import { SuggestionActions } from "@/components/ai/SuggestionActions";
import { ProvenancePopover } from "@/components/ai/ProvenancePopover";
import { NotFound } from "@/components/ai/NotFound";

export function ExtractionRunner({
  reviewId,
  recordId,
  fields,
  values,
  onRun,
  onRatify,
}: {
  reviewId: string;
  recordId: string;
  fields: ExtractionFieldRow[];
  values: ExtractionValueView[];
  onRun: (
    reviewId: string,
    recordId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onRatify: (
    reviewId: string,
    valueId: string,
    state: SuggestionState,
    finalValue: unknown,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const byField = new Map(values.map((v) => [v.field_id, v]));

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await onRun(reviewId, recordId);
      if (!r.ok) setError(r.error ?? "Falha ao extrair.");
    });
  }

  function ratify(valueId: string, state: SuggestionState, current: unknown) {
    setError(null);
    startTransition(async () => {
      const finalValue =
        state === "edited"
          ? { value: window.prompt("Novo valor:", String(current ?? "")) ?? "" }
          : { value: current };
      const r = await onRatify(reviewId, valueId, state, finalValue);
      if (!r.ok) setError(r.error ?? "Falha ao ratificar.");
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Extração por IA</h3>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded border border-accent px-3 py-1 text-xs text-accent-deep focus-visible:ring disabled:opacity-50"
        >
          {pending ? "Extraindo…" : "Extrair por IA"}
        </button>
      </div>
      {error && <p className="text-xs text-warn">{error}</p>}
      <ul className="divide-y divide-line">
        {fields.map((f) => {
          const v = byField.get(f.id);
          const out = v?.output as {
            value: unknown;
            source_span: string | null;
            page: number | null;
          } | null;
          const isFinal = v?.state === "accepted" || v?.state === "edited";
          return (
            <li
              key={f.id}
              className="flex items-start justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{f.name}</p>
                {!v && (
                  <p className="text-xs text-ink-faint">
                    — ainda sem sugestão —
                  </p>
                )}
                {v?.not_found && <NotFound what={f.name} />}
                {v && !v.not_found && (
                  <p className="truncate text-xs text-ink-soft">
                    {isFinal
                      ? String(
                          (v.final_value as { value?: unknown })?.value ?? "",
                        )
                      : String(out?.value ?? "")}
                    {out?.page != null && (
                      <span className="ml-1 text-ink-faint">
                        · p.{out.page}
                      </span>
                    )}
                    {out?.source_span && (
                      <span className="ml-1 italic">
                        &ldquo;{out.source_span}&rdquo;
                      </span>
                    )}
                  </p>
                )}
              </div>
              {v && (
                <div className="flex shrink-0 items-center gap-2">
                  <SuggestionChip state={v.state} />
                  {v.provenance && (
                    <ProvenancePopover provenance={v.provenance} />
                  )}
                  {!isFinal && (
                    <SuggestionActions
                      disabled={pending}
                      onAccept={() => ratify(v.id, "accepted", out?.value)}
                      onEdit={() => ratify(v.id, "edited", out?.value)}
                      onReject={() => ratify(v.id, "rejected", null)}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
