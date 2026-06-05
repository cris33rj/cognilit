"use client";

import { useState } from "react";
import {
  draftProtocol,
  saveProtocolDraft,
  lockProtocol,
} from "../../../app/reviews/[reviewId]/protocol/actions";
import { AsyncActionButton } from "@/components/ai/AsyncActionButton";
import { MarkdownPreview } from "@/components/protocol/MarkdownPreview";

type ViewMode = "edit" | "preview";

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
  const [mode, setMode] = useState<ViewMode>(locked ? "preview" : "edit");

  return (
    <section className="flex flex-col gap-2">
      <div className="flex gap-2">
        <AsyncActionButton
          idleLabel="Rascunhar por IA"
          pendingLabel="Rascunhando…"
          disabled={locked || !canDraft}
          title={canDraft ? "" : "Cadastre a chave de IA"}
          className="btn-primary disabled:opacity-50"
          onRun={async () => {
            const r = await draftProtocol(reviewId);
            setMsg(r.ok ? "Rascunho gerado pela IA." : (r.error ?? "Erro"));
          }}
        />
        <button
          type="button"
          disabled={locked}
          onClick={async () => {
            const r = await saveProtocolDraft(reviewId, md);
            setMsg(r.ok ? "Rascunho salvo." : (r.error ?? "Erro"));
          }}
          className="btn-primary disabled:opacity-50"
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
          className="btn-primary disabled:opacity-50"
        >
          Travar protocolo
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Modo de exibição do protocolo"
        className="flex gap-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "edit"}
          onClick={() => setMode("edit")}
          className={`rounded px-3 py-1 text-sm ${
            mode === "edit" ? "bg-ink text-paper" : "hover:bg-paper-2"
          }`}
        >
          Editar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "preview"}
          onClick={() => setMode("preview")}
          className={`rounded px-3 py-1 text-sm ${
            mode === "preview" ? "bg-ink text-paper" : "hover:bg-paper-2"
          }`}
        >
          Visualizar
        </button>
      </div>

      {mode === "edit" ? (
        <textarea
          value={md}
          onChange={(e) => setMd(e.target.value)}
          readOnly={locked}
          rows={16}
          aria-label="Conteúdo do protocolo (Markdown)"
          className="control font-mono text-sm read-only:bg-paper-2"
        />
      ) : (
        <MarkdownPreview markdown={md} />
      )}
      {locked && (
        <p className="text-xs text-ink-soft">
          Protocolo travado: o conteúdo é imutável; registre mudanças como
          emendas abaixo.
        </p>
      )}
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </section>
  );
}
