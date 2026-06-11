"use client";

import { useState, useTransition } from "react";
import { semanticSearchAction } from "./actions";
import type { SemanticHit } from "@/lib/ai/embedding/types";

interface Props {
  reviewId: string;
  searchEnabled: boolean;
}

export function SemanticSearch({ reviewId, searchEnabled }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SemanticHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSearch() {
    setMessage(null);
    startTransition(async () => {
      const res = await semanticSearchAction(reviewId, query);
      if (res.ok) {
        setHits(res.hits);
        if (res.hits.length === 0) setMessage("Nenhum trecho encontrado.");
      } else {
        setHits([]);
        setMessage(res.error);
      }
    });
  }

  if (!searchEnabled) {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        Busca semântica indisponível: cadastre a 2ª chave (embeddings) acima. O
        restante do produto segue operável.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Pergunte em linguagem natural sobre os PDFs…"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={onSearch}
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {message && <p className="text-sm text-gray-600">{message}</p>}

      <ul className="space-y-3">
        {hits.map((h, i) => (
          <li key={i} className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-900">{h.source_span}</p>
            <p className="mt-1 text-xs text-gray-500">
              Página {h.page} · origem{" "}
              {h.origin === "ocr_ia" ? "OCR (IA)" : "nativo"} · similaridade{" "}
              {(h.similarity * 100).toFixed(0)}%
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
