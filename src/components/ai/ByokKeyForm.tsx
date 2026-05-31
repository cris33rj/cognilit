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
      className="flex flex-col gap-2 rounded border p-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Chave do provedor de IA (Anthropic){present ? " — já cadastrada" : ""}
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={present ? "•••• (substituir)" : "sk-ant-..."}
          className="border p-2"
        />
      </label>
      <button
        type="submit"
        className="self-start bg-black px-3 py-1 text-sm text-white"
      >
        Salvar chave
      </button>
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </form>
  );
}
