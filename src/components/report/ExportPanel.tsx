"use client";

import { useState, useTransition } from "react";

const FORMAT_OPTIONS = [
  { value: "md", label: "Markdown (.md)" },
  { value: "bibtex", label: "BibTeX (.bib)" },
  { value: "ris", label: "RIS (.ris)" },
] as const;

const FORMAT_LABEL: Record<string, string> = {
  md: "Markdown",
  bibtex: "BibTeX",
  ris: "RIS",
};

interface Artifact {
  id: string;
  format: string;
  created_at: string;
}

export function ExportPanel({
  reviewId,
  artifacts,
  onExport,
}: {
  reviewId: string;
  artifacts: Artifact[];
  onExport: (reviewId: string, formats: string[]) => Promise<{ ok: true }>;
}) {
  const [selected, setSelected] = useState<string[]>(["md"]);
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  function toggle(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  return (
    <section className="space-y-3 rounded border border-line p-3">
      <h2 className="text-sm font-medium text-ink">Exportação</h2>

      <div className="flex flex-wrap gap-3">
        {FORMAT_OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex items-center gap-1 text-sm text-ink"
          >
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>

      <button
        type="button"
        className="rounded bg-ink px-3 py-1 text-sm text-paper disabled:opacity-50"
        disabled={pending || selected.length === 0}
        onClick={() =>
          start(async () => {
            setInfo(null);
            try {
              await onExport(reviewId, selected);
              setInfo("Exportação concluída.");
            } catch {
              setInfo("Erro ao exportar. Tente novamente.");
            }
          })
        }
      >
        Exportar
      </button>
      {info && <p className="text-xs text-ink-soft">{info}</p>}

      {artifacts.length > 0 && (
        <ul className="space-y-1 text-sm">
          {artifacts.map((a) => (
            <li key={a.id}>
              <a
                className="text-accent underline"
                href={`/reviews/${reviewId}/report/export/${a.id}`}
              >
                Baixar {FORMAT_LABEL[a.format] ?? a.format}
              </a>
              <span className="ml-2 text-xs text-ink-soft">
                {new Date(a.created_at).toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
