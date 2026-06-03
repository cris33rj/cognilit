"use client";

import { useState } from "react";
import type { Provenance } from "@/lib/ai/llm/types";

export function ProvenancePopover({ provenance }: { provenance: Provenance }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Ver proveniência da sugestão de IA"
        className="rounded border border-line px-1 text-xs text-ink-soft underline focus:outline-none focus-visible:ring"
      >
        proveniência
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Proveniência"
          className="panel absolute z-10 mt-1 w-72 text-xs"
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-2">
            <dt className="font-semibold">Modelo</dt>
            <dd>{provenance.model}</dd>
            <dt className="font-semibold">Versão</dt>
            <dd>{provenance.version}</dd>
            <dt className="font-semibold">Quando</dt>
            <dd>{new Date(provenance.timestamp).toLocaleString("pt-BR")}</dd>
            <dt className="font-semibold">Origem</dt>
            <dd className="break-words">{provenance.prompt_or_span}</dd>
          </dl>
        </div>
      )}
    </span>
  );
}
