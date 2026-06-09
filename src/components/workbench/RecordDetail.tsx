import type { RecordDetailData } from "@/lib/record/queries";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{value}</dd>
    </div>
  );
}

/**
 * Painel de detalhe do registro focado na triagem T/R (Fatia 15). Presentacional:
 * recebe o detalhe já resolvido; o fetch vive na ScreeningQueue. SEM vocabulário de
 * IA — o revisor lê título/resumo e decide (A-15.4).
 */
export function RecordDetail({
  detail,
  isLoading,
}: {
  detail: RecordDetailData | null;
  isLoading: boolean;
}) {
  const publication = [
    detail?.volume ? `v. ${detail.volume}` : null,
    detail?.issue ? `n. ${detail.issue}` : null,
    detail?.pages ? `p. ${detail.pages}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <aside
      className="panel flex w-[360px] shrink-0 flex-col gap-3 self-start"
      aria-label="Detalhe do registro"
    >
      {isLoading ? (
        <p className="text-sm text-ink-faint">Carregando…</p>
      ) : !detail ? (
        <p className="text-sm text-ink-faint">
          Selecione um registro para ver os detalhes.
        </p>
      ) : (
        <>
          <header className="flex flex-col gap-1">
            <span className="text-sm text-ink-soft">
              {detail.authors.length > 0
                ? detail.authors.join("; ")
                : "Autoria não informada"}
              {detail.year ? ` (${detail.year})` : ""}
            </span>
            <h2 className="panel-title">{detail.title}</h2>
          </header>

          <dl className="flex flex-col gap-1 text-sm">
            {detail.journal && (
              <Field label="Periódico" value={detail.journal} />
            )}
            {detail.doi && <Field label="DOI" value={detail.doi} />}
            {detail.language && (
              <Field label="Idioma" value={detail.language} />
            )}
            {publication && <Field label="Publicação" value={publication} />}
          </dl>

          {detail.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Palavras-chave">
              {detail.keywords.map((kw, i) => (
                <span
                  key={`${kw}-${i}`}
                  className="rounded-full border border-line bg-paper-2 px-2 py-0.5 text-xs text-ink-soft"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {detail.abstract && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Resumo
              </span>
              <p className="max-h-[40vh] overflow-auto whitespace-pre-line text-sm text-ink">
                {detail.abstract}
              </p>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
