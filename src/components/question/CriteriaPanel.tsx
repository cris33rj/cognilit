"use client";

import { useState } from "react";
import { SuggestionChip } from "@/components/ai/SuggestionChip";
import { SuggestionActions } from "@/components/ai/SuggestionActions";
import { NotFound } from "@/components/ai/NotFound";
import type { CriterionRow } from "@/lib/question/queries";
import {
  deriveCriteria,
  ratifyCriterion,
} from "../../../app/reviews/[reviewId]/question/actions";

const KIND_LABEL = {
  inclusion: "Inclusão",
  exclusion: "Exclusão",
  search_term: "Termo de busca",
} as const;

export function CriteriaPanel({
  reviewId,
  criteria,
  canDerive,
}: {
  reviewId: string;
  criteria: CriterionRow[];
  canDerive: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium text-ink">
          Critérios e termos (sugeridos pela IA)
        </h2>
        <button
          type="button"
          disabled={!canDerive}
          title={canDerive ? "" : "Salve a pergunta e cadastre a chave de IA"}
          onClick={async () => {
            const r = await deriveCriteria(reviewId);
            setNotFound(!!r.ok && !!r.notFound);
            setMsg(
              r.ok ? "Sugestões geradas." : "error" in r ? r.error : "Erro",
            );
          }}
          className="btn-primary disabled:opacity-50"
        >
          Derivar por IA
        </button>
        {msg && <span className="text-xs text-ink-soft">{msg}</span>}
      </div>

      {notFound && <NotFound what="Sugestões de critérios" />}

      <ul className="flex flex-col gap-2">
        {criteria.map((c) => (
          <li key={c.id} className="panel flex flex-wrap items-center gap-2">
            <span className="panel-title">{KIND_LABEL[c.kind]}</span>
            <span className="flex-1 text-ink">{c.text}</span>
            {c.origin === "ai" && (
              <SuggestionChip state={c.ratification_state} />
            )}
            {c.origin === "ai" && c.ratification_state === "pending" && (
              <SuggestionActions
                onAccept={async () => {
                  await ratifyCriterion(reviewId, c.id, "accepted");
                }}
                onEdit={async () => {
                  const t = window.prompt("Editar critério", c.text);
                  if (t) await ratifyCriterion(reviewId, c.id, "edited", t);
                }}
                onReject={async () => {
                  await ratifyCriterion(reviewId, c.id, "rejected");
                }}
              />
            )}
          </li>
        ))}
        {criteria.length === 0 && (
          <li className="text-sm text-ink-soft">Nenhum critério ainda.</li>
        )}
      </ul>
    </section>
  );
}
