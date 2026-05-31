"use client";

import { useState } from "react";
import {
  FRAMEWORK_FIELDS,
  FRAMEWORKS,
  type Framework,
} from "@/lib/question/schema";
import { saveQuestion } from "../../../app/reviews/[reviewId]/question/actions";

const FRAMEWORK_LABEL: Record<Framework, string> = {
  spider: "SPIDER",
  pico: "PICo",
  peo: "PEO",
  pcc: "PCC",
  free: "Livre",
};
const FIELD_LABEL: Record<string, string> = {
  sample: "Amostra",
  phenomenon: "Fenômeno",
  design: "Desenho",
  evaluation: "Avaliação",
  researchType: "Tipo de pesquisa",
  population: "População",
  intervention: "Intervenção",
  comparison: "Comparação",
  outcome: "Desfecho",
  exposure: "Exposição",
  concept: "Conceito",
  context: "Contexto",
};

export function QuestionForm({
  reviewId,
  initial,
}: {
  reviewId: string;
  initial: {
    framework: Framework;
    question_text: string;
    fields: Record<string, string>;
  } | null;
}) {
  const [framework, setFramework] = useState<Framework>(
    initial?.framework ?? "spider",
  );
  const [fields, setFields] = useState<Record<string, string>>(
    initial?.fields ?? {},
  );
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        fd.set("framework", framework);
        fd.set("fields", JSON.stringify(fields));
        const r = await saveQuestion(reviewId, fd);
        setMsg(r.ok ? "Pergunta salva." : "error" in r ? r.error : "Erro");
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        Framework
        <select
          value={framework}
          onChange={(e) => setFramework(e.target.value as Framework)}
          className="border p-2"
        >
          {FRAMEWORKS.map((f) => (
            <option key={f} value={f}>
              {FRAMEWORK_LABEL[f]}
            </option>
          ))}
        </select>
      </label>

      {FRAMEWORK_FIELDS[framework].map((key) => (
        <label key={key} className="flex flex-col gap-1 text-sm">
          {FIELD_LABEL[key] ?? key}
          <input
            value={fields[key] ?? ""}
            onChange={(e) =>
              setFields((p) => ({ ...p, [key]: e.target.value }))
            }
            className="border p-2"
          />
        </label>
      ))}

      <label className="flex flex-col gap-1 text-sm">
        Pergunta
        <textarea
          name="questionText"
          defaultValue={initial?.question_text ?? ""}
          required
          className="border p-2"
          rows={3}
        />
      </label>

      <button
        type="submit"
        className="self-start bg-black px-3 py-1 text-sm text-white"
      >
        Salvar pergunta
      </button>
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </form>
  );
}
