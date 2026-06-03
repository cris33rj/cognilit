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

const FIELD_GLYPH: Record<string, string> = {
  sample: "S",
  phenomenon: "PI",
  design: "D",
  evaluation: "E",
  researchType: "R",
  population: "P",
  intervention: "I",
  comparison: "C",
  outcome: "O",
  exposure: "E",
  concept: "C",
  context: "C",
};

const FRAMEWORK_ACRONYM: Partial<Record<Framework, string>> = {
  spider:
    "Sample · Phenomenon of Interest · Design · Evaluation · Research type",
  pico: "Population · Intervention · Comparison · Outcome",
  peo: "Population · Exposure · Outcome",
  pcc: "Population · Concept · Context",
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
        <span className="select-wrap">
          <select
            value={framework}
            onChange={(e) => setFramework(e.target.value as Framework)}
            className="control appearance-none pr-8 font-semibold"
          >
            {FRAMEWORKS.map((f) => (
              <option key={f} value={f}>
                {FRAMEWORK_LABEL[f]}
              </option>
            ))}
          </select>
        </span>
      </label>
      {FRAMEWORK_ACRONYM[framework] && (
        <p
          data-testid="framework-acronym"
          className="font-mono text-xs text-ink-faint"
        >
          {FRAMEWORK_ACRONYM[framework]}
        </p>
      )}

      {FRAMEWORK_FIELDS[framework].map((key) => {
        const g = FIELD_GLYPH[key] ?? "";
        return (
          <label key={key} className="field flex flex-col gap-1 text-sm">
            <span data-testid="field-glyph" className="field-glyph" aria-hidden>
              {g.length > 1 ? (
                <>
                  {g[0]}
                  <small>{g.slice(1)}</small>
                </>
              ) : (
                g
              )}
            </span>
            {FIELD_LABEL[key] ?? key}
            <input
              value={fields[key] ?? ""}
              onChange={(e) =>
                setFields((p) => ({ ...p, [key]: e.target.value }))
              }
              className="control"
            />
          </label>
        );
      })}

      <label className="flex flex-col gap-1 text-sm">
        Pergunta
        <textarea
          name="questionText"
          defaultValue={initial?.question_text ?? ""}
          required
          className="control"
          rows={3}
        />
      </label>

      <button type="submit" className="btn-primary self-start">
        Salvar pergunta
      </button>
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </form>
  );
}
