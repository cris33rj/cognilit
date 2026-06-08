import type { SearchSummary } from "@/lib/search/queries";

/**
 * Histórico read-only das importações (Fatia 14): uma linha por busca, com base de dados,
 * data da importação (dd/mm/aaaa) e quantidade de artigos. Sem ações.
 */
export function ImportHistory({ searches }: { searches: SearchSummary[] }) {
  return (
    <section className="panel flex flex-col gap-3" aria-label="Importações anteriores">
      <h2 className="panel-title">Importações anteriores</h2>
      {searches.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhuma importação ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {searches.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-4 border-t border-line pt-2 text-sm first:border-t-0 first:pt-0"
            >
              <span className="font-medium text-ink">{s.database}</span>
              <span className="text-ink-faint">
                {new Date(s.createdAt).toLocaleDateString("pt-BR")}
              </span>
              <span className="text-ink-soft">
                {s.recordCount} artigo{s.recordCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
