# COMPLETION — Fatia 14: Histórico de buscas importadas

**Branch:** `build/001-marco1-nucleo-fluxo/14-import-history-list` (HEAD `42c6f73`)
**Estado:** CHECKPOINT 3 — implementada, verde, **aguardando merge manual** do desenvolvedor.
**Base da feature:** `f741b1c` (`001-marco1-nucleo-fluxo`).
**Data:** 2026-06-08 (UTC).

> Sessão B (Superpowers v5.1.0). Execução por `subagent-driven-development` com revisão
> dupla (spec + qualidade) por grupo de tarefas. A sessão **NUNCA** mergeou nem deu push.

---

## O que foi entregue (obs 4 do desenvolvedor — versão read-only)

Uma lista **read-only** das importações já feitas, no **modo Importar** do workbench (mesma
superfície — Princípio V, nenhuma rota nova), abaixo do formulário de importação. Uma linha
por busca com:

- **Base de dados** (`search.database`);
- **Data da importação** (`search.created_at`, exibida `dd/mm/aaaa` via `toLocaleDateString("pt-BR")`);
- **Quantidade de artigos** (contagem de `record` por `search_id`, "N artigo(s)").

Estado vazio: "Nenhuma importação ainda." A lista re-renderiza após uma importação porque
as actions de importação já chamam `revalidatePath` do workbench.

**Escopo deliberadamente excluído (decisão do CHECKPOINT 1):** desfazer/reverter importação,
editar registro de busca, expandir artigos, paginação/filtro. (A reversão destrutiva — que
tocaria auditoria append-only e a trava do protocolo — fica como possível fatia futura.)

## Arquitetura

- **`listSearches(reviewId)`** ([src/lib/search/queries.ts](../../../src/lib/search/queries.ts)):
  lê `search` com a contagem de `record` embutida via PostgREST (`SEARCH_SUMMARY_SELECT =
  "id, database, created_at, record(count)"`), mais recente primeiro. Mapeamento puro em
  `toSearchSummaries` (extrai `record[0].count ?? 0`). **Sem migration.**
- **`ImportHistory`** ([src/components/workbench/ImportHistory.tsx](../../../src/components/workbench/ImportHistory.tsx)):
  **componente de servidor** puro (sem `"use client"`); recebe `searches: SearchSummary[]`.
- **Página** ([app/reviews/[reviewId]/workbench/page.tsx](../../../app/reviews/%5BreviewId%5D/workbench/page.tsx)):
  `listSearches` chamado só no modo Importar; renderiza `<ImportHistory>` abaixo do `<ImportPanel>`.

## Arquivos (diff `f741b1c..42c6f73`, 6 arquivos, +237/−2)

- **Criados:** `src/components/workbench/ImportHistory.tsx`,
  `tests/unit/search/import-history-mapper.test.ts`,
  `tests/unit/workbench/import-history.test.tsx`, `tests/integration/import-history.test.ts`.
- **Modificados:** `src/lib/search/queries.ts` (acréscimo),
  `app/reviews/[reviewId]/workbench/page.tsx`.
- **Sem** migration, **sem** mudança de schema, **sem** nova dependência.

## Commits (ordem de execução)

- `4aedd2f` feat(14): toSearchSummaries + SEARCH_SUMMARY_SELECT (contagem por busca) — *Tasks 1+2 (ambas append em `queries.ts`); `listSearches` incluso aqui*
- `e5c15f1` test(14): integração prova embedding record(count) no histórico
- `5ce1c53` refactor(14): exporta RawSearchRow + comentário do cast (review minors)
- `a2e27dd` feat(14): ImportHistory — lista read-only de importações (obs 4)
- `be9cdd0` feat(14): workbench page renderiza ImportHistory no modo Importar
- `42c6f73` test(14): asserção de contagem por texto completo (review minor)

## Desvio em relação ao plano (registrado)

- **Fixture de data no teste de componente.** O plano usava `2026-05-30` (→ `30/05/2026`),
  cuja substring "05" colidia com `getByText(/5/)` (a contagem "5 artigos") ⇒ "multiple
  elements". Corrigido na execução: data ajustada para `2026-03-30`/`2026-04-02` e, na revisão
  de qualidade, as asserções de contagem trocadas por texto completo (`"12 artigos"`/`"5
  artigos"`) — robusto contra colisão. Código do componente inalterado.

## Verificação (gate)

- **Unit (Vitest):** `npm run test -- tests/unit` → **125 passed / 33 files** (5 novos:
  3 em `import-history-mapper.test.ts`, 2 em `import-history.test.tsx`; baseline 120).
- **Integração (Supabase local):** `npm run test -- tests/integration/import-history.test.ts`
  → **2 passed** — prova o embedding `record(count)`: 1 importação ⇒ 1 linha (contagem 2);
  2ª importação ⇒ 2 linhas, mais recente primeiro.
- **e2e (Playwright):** `npm run test:e2e -- import.spec.ts` → **1 passed (50.2s)** — fluxo de
  importação intacto com a lista presente.
- **Type-check:** `npm run typecheck` (`tsc --noEmit`) → limpo.
- **Lint:** `npm run lint` (`next lint`) → "No ESLint warnings or errors".

## Revisão (subagent-driven, 2 estágios por grupo)

- **Grupo 1 (Tasks 1/2/5):** spec ✅; qualidade ✅ (2 minors aplicados: `RawSearchRow`
  exportado, comentário do cast).
- **Grupo 2 (Tasks 3/4):** spec ✅ (desvio de fixture validado); qualidade ✅ (1 minor
  aplicado: asserção de contagem por texto completo).

## Pendência

Desenvolvedor revisa o diff e faz o `merge` manual na branch da feature. Após o merge, marcar
o checklist da `slicing.md` como `[x] ... mergeada — merge <sha>`. Com a Fatia 14 mergeada, as
quatro observações originais do desenvolvedor sobre a tela de importação estão **todas
endereçadas** (obs 1/2/3 na Fatia 13; obs 4 — versão read-only — aqui).
