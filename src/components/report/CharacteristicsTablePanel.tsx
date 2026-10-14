import type { CharacteristicsTable } from "@/lib/prisma/characteristics";

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export function CharacteristicsTablePanel({
  table,
}: {
  table: CharacteristicsTable;
}) {
  if (table.rows.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Sem estudos incluídos com extração ratificada para caracterizar.
      </p>
    );
  }
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Características dos estudos</h2>
      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {table.columns.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr
                key={r.recordId}
                className="border-b border-line last:border-0"
              >
                {table.columns.map((c) => (
                  <td key={c} className="px-3 py-2 align-top">
                    {renderCell(r.cells[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
