"use client";

import type { ParsedRecord } from "@shared/import/types";

export function ImportPreview({ records }: { records: ParsedRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded border">
      <table className="min-w-full text-sm">
        <caption className="sr-only">Pré-visualização dos registros</caption>
        <thead className="bg-paper-2 text-left">
          <tr>
            <th className="p-2">Título</th>
            <th className="p-2">Autores</th>
            <th className="p-2">Ano</th>
            <th className="p-2">DOI</th>
          </tr>
        </thead>
        <tbody>
          {records.slice(0, 20).map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.title}</td>
              <td className="p-2">{r.authors.join("; ")}</td>
              <td className="p-2">{r.year ?? "—"}</td>
              <td className="p-2">{r.doi ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-2 text-xs text-ink-faint">
        {records.length} registro(s) — exibindo até 20 na prévia.
      </p>
    </div>
  );
}
