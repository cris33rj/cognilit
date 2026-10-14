import { NotFound } from "@/components/ai/NotFound";
import type { ThemeSummaryTable } from "@/lib/synthesis/summary-table";

/**
 * Normaliza o valor de uma célula em texto exibível.
 * A célula é o snapshot de `extraction_value.final_value` (A1), cujo contrato é
 * `{value, source_span, page}` (ou `{value: null, reason}` p/ não-encontrado) —
 * mas também pode já ser um escalar. Extrai `.value` quando objeto; `null`
 * (ausente ou não-encontrado) ⇒ retorna null p/ o chamador exibir NotFound.
 */
function cellText(cell: unknown): string | null {
  const value =
    cell !== null && typeof cell === "object" && "value" in cell
      ? (cell as { value: unknown }).value
      : cell;
  return value == null ? null : String(value);
}

/**
 * Renderiza a tabela estudos×campos de um tema (ThemeSummaryTable).
 * Célula null/não-encontrada ⇒ exibe NotFound ("não encontrado").
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
              {table.columns.map((col) => {
                const text = cellText(row.cells[col]);
                return (
                  <td
                    key={col}
                    className="border border-line px-2 py-1 text-ink"
                  >
                    {text == null ? <NotFound /> : text}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
