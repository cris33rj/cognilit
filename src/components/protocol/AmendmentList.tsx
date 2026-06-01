"use client";

import { useState } from "react";
import type { AmendmentRow } from "@/lib/protocol/queries";
import { addAmendment } from "../../../app/reviews/[reviewId]/protocol/actions";

export function AmendmentList({
  reviewId,
  amendments,
  locked,
}: {
  reviewId: string;
  amendments: AmendmentRow[];
  locked: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Emendas versionadas</h2>
      <ul className="flex flex-col gap-1">
        {amendments.map((a) => (
          <li key={a.id} className="rounded border p-2 text-sm">
            <span className="font-semibold">v{a.version}</span>{" "}
            <span className="text-zinc-500">
              ({new Date(a.dated_at).toLocaleDateString("pt-BR")})
            </span>
            <div>
              {(a.change as { text?: string }).text ?? JSON.stringify(a.change)}
            </div>
          </li>
        ))}
        {amendments.length === 0 && (
          <li className="text-sm text-zinc-500">Sem emendas.</li>
        )}
      </ul>

      {locked && (
        <form
          action={async (fd) => {
            const r = await addAmendment(reviewId, fd);
            setMsg(r.ok ? "Emenda registrada." : (r.error ?? "Erro"));
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            name="change"
            rows={2}
            required
            className="border p-2 text-sm"
            placeholder="Descreva a mudança (emenda datada)"
          />
          <button
            type="submit"
            className="self-start rounded border px-3 py-1 text-sm"
          >
            Adicionar emenda
          </button>
          {msg && <p className="text-xs text-zinc-600">{msg}</p>}
        </form>
      )}
    </section>
  );
}
