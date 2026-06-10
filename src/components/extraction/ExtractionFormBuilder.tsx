"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  type ExtractionFieldType,
} from "@/lib/extraction/schema";
import type { ExtractionFieldRow } from "@/lib/extraction/queries";

type ActionResult = { ok: true } | { ok: false; error: string };

interface Props {
  reviewId: string;
  fields: ExtractionFieldRow[];
  onAdd: (
    reviewId: string,
    input: { name: string; type: ExtractionFieldType; options?: string[] },
  ) => Promise<ActionResult>;
  onUpdate: (
    reviewId: string,
    fieldId: string,
    input: { name: string; type: ExtractionFieldType; options?: string[] },
  ) => Promise<ActionResult>;
  onRemove: (reviewId: string, fieldId: string) => Promise<ActionResult>;
  onReorder: (reviewId: string, fieldIds: string[]) => Promise<ActionResult>;
}

export function ExtractionFormBuilder({
  reviewId,
  fields,
  onAdd,
  onUpdate,
  onRemove,
  onReorder,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ExtractionFieldType>("text");
  const [optionsText, setOptionsText] = useState("");

  // onUpdate é exposto para edição inline numa iteração futura; mantido no contrato
  // para a Fatia 4 (re-extração) sem alterar a assinatura do builder.
  void onUpdate;

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleAdd() {
    const options =
      type === "select"
        ? optionsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    run(async () => {
      const res = await onAdd(reviewId, { name, type, options });
      if (res.ok) {
        setName("");
        setType("text");
        setOptionsText("");
        setShowForm(false);
      }
      return res;
    });
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const ids = fields.map((f) => f.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    run(() => onReorder(reviewId, ids));
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Formulário de extração
        </h1>
        <p className="text-sm text-zinc-500">
          Monte os campos que a IA preencherá por estudo. Um formulário por
          revisão.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {fields.length === 0 && (
          <li className="px-4 py-6 text-sm text-zinc-500">
            Nenhum campo ainda.
          </li>
        )}
        {fields.map((f, i) => (
          <li key={f.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Mover para cima"
                disabled={pending || i === 0}
                onClick={() => move(i, -1)}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Mover para baixo"
                disabled={pending || i === fields.length - 1}
                onClick={() => move(i, 1)}
                className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
            <div className="flex-1">
              <p className="font-medium text-zinc-900 dark:text-zinc-100">
                {f.name}
              </p>
              <p className="text-xs text-zinc-500">
                {FIELD_TYPE_LABELS[f.type]}
                {f.type === "select" && f.options
                  ? ` · ${f.options.join(", ")}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => onRemove(reviewId, f.id))}
              className="text-sm text-red-600 hover:underline disabled:opacity-40"
            >
              Remover
            </button>
          </li>
        ))}
      </ul>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Adicionar campo
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Novo campo
          </h2>
          <div className="flex flex-wrap gap-3">
            <input
              aria-label="Nome do campo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do campo"
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:bg-zinc-900"
            />
            <select
              aria-label="Tipo do campo"
              value={type}
              onChange={(e) => setType(e.target.value as ExtractionFieldType)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:bg-zinc-900"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {type === "select" && (
            <input
              aria-label="Opções (separadas por vírgula)"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Opções separadas por vírgula (ex.: RCT, Coorte)"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:bg-zinc-900"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleAdd}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Salvar campo
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
