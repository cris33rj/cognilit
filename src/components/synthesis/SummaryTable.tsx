import { NotFound } from "@/components/ai/NotFound";
import type { ThemeSummaryTable } from "@/lib/synthesis/summary-table";

/**
 * Renderiza a tabela estudos×campos de um tema (ThemeSummaryTable).
 * Célula null ⇒ exibe NotFound ("não encontrado").
 * Acessível: usa <table> com <th scope>.
 */
export function SummaryTable({ table }: { table: ThemeSummaryTable }) {
  if (table.columns.length === 0 || table.rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th
              scope="col"
              className="border border-line bg-canvas-subtle px-2 py-1 text-left font-semibold text-ink"
            >
              Estudo
            </th>
            {table.columns.map((col) => (
              <th
                key={col}
                scope="col"
                className="border border-line bg-canvas-subtle px-2 py-1 text-left font-semibold text-ink"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.recordId} className="even:bg-canvas-subtle">
              <th
                scope="row"
                className="border border-line px-2 py-1 text-left font-medium text-ink"
              >
                {row.label}
              </th>
              {table.columns.map((col) => (
                <td key={col} className="border border-line px-2 py-1 text-ink">
                  {row.cells[col] == null ? (
                    <NotFound />
                  ) : (
                    String(row.cells[col])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
