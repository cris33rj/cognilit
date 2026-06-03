"use client";

import { useState } from "react";
import { saveByokKey } from "@/lib/byok/actions";

export function ByokKeyForm({
  reviewId,
  present,
}: {
  reviewId: string;
  present: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      action={async (fd) => {
        const r = await saveByokKey(reviewId, fd);
        setMsg(
          r.ok
            ? "Chave salva (cifrada no Vault)."
            : "error" in r
              ? r.error
              : "Erro",
        );
      }}
      className="panel flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1 text-sm">
        Chave do provedor de IA (Anthropic){present ? " — já cadastrada" : ""}
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={present ? "•••• (substituir)" : "sk-ant-..."}
          className="control"
        />
      </label>
      <button type="submit" className="btn-primary self-start">
        Salvar chave
      </button>
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </form>
  );
}
