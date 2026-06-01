"use client";

import { useState } from "react";
import {
  draftProtocol,
  saveProtocolDraft,
  lockProtocol,
} from "../../../app/reviews/[reviewId]/protocol/actions";

export function ProtocolEditor({
  reviewId,
  initialMarkdown,
  locked,
  canDraft,
}: {
  reviewId: string;
  initialMarkdown: string;
  locked: boolean;
  canDraft: boolean;
}) {
  const [md, setMd] = useState(initialMarkdown);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={locked || !canDraft}
          title={canDraft ? "" : "Cadastre a chave de IA"}
          onClick={async () => {
            const r = await draftProtocol(reviewId);
            setMsg(r.ok ? "Rascunho gerado pela IA." : (r.error ?? "Erro"));
          }}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          Rascunhar por IA
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            const r = await saveProtocolDraft(reviewId, md);
            setMsg(r.ok ? "Rascunho salvo." : (r.error ?? "Erro"));
          }}
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        >
          Salvar rascunho
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            if (
              !window.confirm(
                "Travar o protocolo? Mudanças passarão a ser emendas.",
              )
            )
              return;
            const r = await lockProtocol(reviewId);
            setMsg(r.ok ? "Protocolo travado." : (r.error ?? "Erro"));
          }}
          className="rounded border border-zinc-700 px-3 py-1 text-sm disabled:opacity-50"
        >
          Travar protocolo
        </button>
      </div>

      <textarea
        value={md}
        onChange={(e) => setMd(e.target.value)}
        readOnly={locked}
        rows={16}
        aria-label="Conteúdo do protocolo (Markdown)"
        className="border p-2 font-mono text-sm read-only:bg-zinc-50 dark:read-only:bg-zinc-900"
      />
      {locked && (
        <p className="text-xs text-zinc-600">
          Protocolo travado: o conteúdo é imutável; registre mudanças como
          emendas abaixo.
        </p>
      )}
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </section>
  );
}
