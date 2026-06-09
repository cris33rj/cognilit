# COMPLETION — Fatia 15: Painel de detalhe do registro na triagem T/R

**Branch:** `build/001-marco1-nucleo-fluxo/15-record-detail-panel` (HEAD a definir — este commit de docs)
**Estado:** CHECKPOINT 3 — implementada, verde, **aguardando merge manual** do desenvolvedor.
**Base da feature:** `f6e55e3` (`001-marco1-nucleo-fluxo`, commit do IMPLEMENTATION_PLAN da Fatia 15).
**Data:** 2026-06-09 (UTC).

> Sessão B (Superpowers v5.1.0). Execução por `subagent-driven-development` com revisão dupla
> (spec + qualidade) por tarefa. A sessão **NUNCA** mergeou nem deu push.

---

## O que foi entregue

Um **painel de detalhe** à direita da fila de triagem, **somente no modo Título/Resumo**
(mestre-detalhe), exibindo os metadados ricos do registro **focado** (`j`/`k` ou clique):

- **Autores (ano)**, **título**, **periódico**, **DOI**, **idioma**, **publicação**
  (volume/issue/páginas), **palavras-chave** (chips) e **resumo** (rolável).
- Campos ausentes são **omitidos** com elegância; estados de carregamento e vazio próprios.
- **Sem nenhum vocabulário de IA** no painel (A-15.4): o revisor lê título/resumo e decide.

Cumpre **FR-041/D32** — a superfície "detalhe" do mestre-detalhe que as Fatias 1–6 deixaram
parcial (só o lado "mestre"/fila). **Não** adiciona FR; **não** altera decisão assinada.

**Escopo deliberadamente excluído (CHECKPOINT 1):** painel no Texto completo/Duplicatas/
Importar; layout B (gaveta do `JobsPanel`/cirurgia no shell); edição de metadados; IA no
painel ou qualquer mudança no chip de IA inline da fila (**FR-024/D12 intactos**); conteúdo de
PDF/texto completo (Marco 2). **Sem migration.**

## Arquitetura

- **`extractRawFields(format, raw)`** ([src/lib/record/raw-fields.ts](../../../src/lib/record/raw-fields.ts)):
  função pura que extrai `journal`/`keywords`/`volume`/`issue`/`pages` do `record.raw` com
  chaves cientes do formato (RIS `JO`/`JF`/`T2`+`KW`+`SP`–`EP`; BibTeX `journal`/`keywords`/
  `number`; CSV cabeçalho case-insensitive). Nulos graciosos; `raw` não-objeto ⇒ vazio.
- **`getRecordDetail(recordId)` + `toRecordDetail` (puro)** ([src/lib/record/queries.ts](../../../src/lib/record/queries.ts)):
  funde `metadata` normalizado (título/autores/ano/DOI/idioma/resumo) + extração do `raw`.
  `RECORD_DETAIL_SELECT` exportado e reusado pelo teste de integração. **O dado já existe no
  banco — nada de re-importar, nada de migration.**
- **`fetchRecordDetail` (server action)** ([app/reviews/[reviewId]/workbench/actions.ts](../../../app/reviews/%5BreviewId%5D/workbench/actions.ts)):
  guarda de membership (`requireMember`) + `getRecordDetail`.
- **`RecordDetail`** ([src/components/workbench/RecordDetail.tsx](../../../src/components/workbench/RecordDetail.tsx)):
  componente presentacional puro (`{ detail, isLoading }`), tema do design system, ARIA.
- **`ScreeningQueue`** ([src/components/workbench/ScreeningQueue.tsx](../../../src/components/workbench/ScreeningQueue.tsx)):
  busca o detalhe do registro focado via TanStack Query (chave por `recordId`, `enabled` só no
  `title_abstract`, `staleTime: 60s`) — **sob demanda**, sem inchar a fila de ~5.000 (orçamento
  A2); envolve a grade num layout `[fila | detalhe]` apenas no T/R. `JobsPanel`/shell intactos.

## Arquivos (diff `f6e55e3..HEAD`, 13 arquivos, +779/−94)

- **Criados:** `src/lib/record/raw-fields.ts`, `src/lib/record/queries.ts`,
  `src/components/workbench/RecordDetail.tsx`, `tests/unit/record/raw-fields.test.ts`,
  `tests/unit/record/record-detail-mapper.test.ts`,
  `tests/unit/workbench/record-detail.test.tsx`, `tests/integration/record-detail.test.ts`,
  `tests/fixtures/import/detail-rich.ris`.
- **Modificados:** `src/components/workbench/ScreeningQueue.tsx` (a maior parte das ~94
  remoções é **reindentação** da grade ao envolvê-la no wrapper flex — sem mudança de lógica;
  o chip de IA inline só mudou de indentação), `app/reviews/[reviewId]/workbench/page.tsx`
  (+2), `app/reviews/[reviewId]/workbench/actions.ts` (+7),
  `tests/unit/workbench/screening-queue.test.tsx` (harness + 2 testes).
- **Sem** migration, **sem** mudança de schema, **sem** nova dependência.

## Commits (ordem de execução)

- `b8d518a` feat(15): extractRawFields — periódico/palavras-chave do raw por formato — *Task 1*
- `17a1c43` test(15): cobre branches SP-sem-EP, coerção numérica e fallback T2 — *review minor T1*
- `9a3c5d5` feat(15): getRecordDetail — funde metadata + extração do raw (query/mapper/integração) — *Task 2*
- `672ecf5` refactor(15): RECORD_DETAIL_SELECT as const + describe de integração mais preciso — *review minor T2*
- `286e737` feat(15): fetchRecordDetail server action (guarda de membership) — *Task 3*
- `1b8edd7` feat(15): RecordDetail — painel presentacional de metadados (sem IA) — *Task 4*
- `f042cc2` fix(15): chave estável para chips de palavra-chave — *review minor T4*
- `7bcc958` feat(15): mestre-detalhe no T/R — ScreeningQueue busca e exibe o detalhe — *Task 5*
- `82c7ca5` perf(15): staleTime no detalhe do registro — evita refetch a cada j/k — *review minor T5*
- `2fd10e6` test(15): e2e do painel de detalhe no T/R (periódico/keywords) e ausência no TC — *Task 6*

## Verificação (gate)

- **Type-check:** `npm run typecheck` (`tsc --noEmit`) → **limpo**.
- **Lint:** `npm run lint` (`next lint`) → "No ESLint warnings or errors".
- **Unit + integração (Vitest):** `npm test` → **232 passed / 55 files** (novos da fatia: 8 em
  `raw-fields.test.ts`, 2 em `record-detail-mapper.test.ts`, 2 em `record-detail.test.ts`
  (integração), 4 em `record-detail.test.tsx`, +2 em `screening-queue.test.tsx`).
- **e2e (Playwright):** `npm run test:e2e` → **15 passed**, incluindo o gate da Fatia 5
  preservado — `screening-perf` (~5.000 registros, DOM virtualizado) e `screening-a11y`
  (SC-013) verdes — e o novo `screening.spec.ts:181` (painel mostra periódico/keywords no T/R;
  ausente no TC).

## Desvios / observações (registrados)

- **Flake de concorrência na integração (pré-existente, não-Fatia-15).** Na 1ª execução
  paralela de `npm test`, `tests/integration/dedup.test.ts` falhou (avisos "Multiple
  GoTrueClient instances" — testes de integração compartilham um Supabase local em paralelo).
  **Passa 9/9 em isolamento** e a re-execução completa ficou **verde (232/232)**. Não tem
  relação com esta fatia (não toca dedup; o novo teste de integração usa e-mails únicos).
- **Reindentação da `ScreeningQueue`.** Envolver a grade no wrapper flex reindentou todo o
  bloco da grade; o diff sem espaços (`git diff -w`) mostra só as mudanças reais (prop
  `loadDetail`, query do detalhe, wrapper + painel). O chip de IA inline (FR-024) é idêntico.

## Revisão (subagent-driven, 2 estágios por tarefa)

- **Task 1:** spec ✅; qualidade ✅ (2 minors aplicados: cobertura SP-only + coerção numérica).
- **Task 2:** spec ✅; qualidade ✅ (2 minors aplicados: `as const`, describe mais preciso).
- **Task 3:** escopo verificado por inspeção do diff (wrapper fino; 7 inserções).
- **Task 4:** spec ✅; qualidade ✅ (1 minor aplicado: chave estável dos chips).
- **Task 5:** spec ✅ (FR-024 intacto, `full_text` sem painel); qualidade ✅ (1 minor: `staleTime`).
- **Task 6:** escopo verificado por inspeção (apêndice puro, 0 remoções; asserções corretas).

## Pendência

Desenvolvedor revisa o diff e faz o `merge` manual na branch da feature. Após o merge, marcar
o checklist da `slicing.md` como `[x] Fatia 15 … mergeada — merge <sha>`. Com a Fatia 15, a
superfície "detalhe" do mestre-detalhe (FR-041/D32) deixa de ser parcial: os metadados ricos
do registro (autores, periódico, palavras-chave, resumo) passam a ser exibidos na triagem T/R.
