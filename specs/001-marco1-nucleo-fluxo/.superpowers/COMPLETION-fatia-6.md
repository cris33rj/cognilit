# COMPLETION — Fatia 6: Shell, trilho & PRISMA vivo + export de auditoria

**Branch:** `build/001-marco1-nucleo-fluxo/6-shell-prisma-auditoria`
**Estado:** CHECKPOINT 3 — aguardando revisão e **merge manual** do desenvolvedor.
**Fatia:** 6 de 6 (última do Marco 1). Após o merge, o Marco 1 está completo.

## User Stories entregues

- **US7 — Navegar pelo pipeline com trilho de fases e PRISMA vivo**: o shell da Revisão
  (`reviews/[reviewId]/layout.tsx`) passa a exibir, em todas as páginas da Revisão, um
  **trilho de fases** lateral (feito / em curso / pendente / **travado** / opcional-desligado;
  Risco de Viés e Certeza sempre desligadas e não-bloqueantes — D19) e uma **barra PRISMA
  viva** ligada a uma **fonte única** (view `prisma_counter`), que bate **número-a-número**
  com o corpus. Um painel lateral mostra **jobs em andamento** (reusando `JobProgress`) e o
  **consumo de IA acumulado**, além dos links de **export da trilha de auditoria**. O estado
  de **filtro/ordenação da fila de triagem é reabrível pela URL**, e a trilha de auditoria
  exporta em **JSON + CSV** (com as reversões presentes).

## Requisitos funcionais cobertos

| FR | Descrição | Onde |
|----|-----------|------|
| FR-036 | Contadores PRISMA vivos refletindo o corpus em tempo real | View `prisma_counter` (`security_invoker`, fonte única) + `getPrismaCounters` (`src/lib/prisma/queries.ts`) + `PrismaBar` no `layout.tsx`; "excluídos por razão" via view `prisma_exclusion_breakdown` + `getExclusionBreakdown` |
| FR-035 | Trilha append-only exportável (ator, timestamp, antes/depois) | `listAuditTrail` (`src/lib/audit/queries.ts`) + serializadores puros `toAuditJson`/`toAuditCsv` (`src/lib/audit/export.ts`, JSON sem perda + CSV RFC-4180) + Route Handler `app/reviews/[reviewId]/audit/export/route.ts` (guarda `is_review_member`) |
| FR-037 | Preservar e reabrir filtros/ordenação de uma fila de triagem | Módulo puro `src/lib/screening/queue-url.ts` (`parseQueueState`/`serializeQueueState`/`applyQueueView`) ligado ao `ScreeningQueue` via `searchParams` + `router.replace` (sem refetch; toda indexação roteada por `visibleRows`) |
| US7 (trilho) | Trilho de fases com 5 estados; Viés/Certeza desligadas | `computePhaseStates` (puro) + `loadPhaseStates` (`src/lib/shell/phases.ts`) + `PhaseRail` (`aria-current="step"`, `data-status`) |
| Shell (jobs+custo) | Painel de jobs e consumo de IA no shell | `summarizeUsage` (puro) + `getJobsAndUsage` (`src/lib/shell/usage.ts`) + `JobsPanel` (reusa `JobProgress`) |

**Fonte única (SC-004):** o workbench deixou de renderizar contadores PRISMA inline; a
exibição canônica vive agora na `PrismaBar` do shell, alimentada exclusivamente pela view
`prisma_counter`. A semântica: `identificados` = todos os records; `duplicados` = `corpus_state`
`duplicate_exact`+`duplicate_fuzzy`; `triados` = `ts_decision ∈ {included,excluded}`; demais por
`corpus_state`.

Transversais reforçadas: **SC-004** (PRISMA número-a-número — integração + e2e), **SC-006**
(reversões aparecem na trilha exportável — integração), **a11y** (trilho com `aria-current`,
barra com `aria-live`, controles de fila rotulados e teclado-acessíveis), **Princípio V**
(workbench não-refragmentado: o trilho é navegação por modo, não rotas separadas), **Princípio
III/IV** (RLS preservada nas views via `security_invoker`; auditoria append-only).

## Fora de escopo (respeitado)

Nada de Marco 3 entrou: **sem** fluxograma PRISMA renderizado e **sem** exportações DOCX/PDF/MD.
A Fatia 6 entrega apenas **contadores** e **export da trilha de auditoria**. Nenhuma tabela ou
mutação nova foi criada — apenas views derivadas e leitura.

## Decisões de implementação (D-F6.*)

- **D-F6.1 — Fonte única via views `security_invoker`.** Os contadores PRISMA vêm de
  `prisma_counter`/`prisma_exclusion_breakdown` (migration `0007`), com `security_invoker = true`
  para que a RLS de `record`/`exclusion_reason` continue valendo. Nenhuma contagem ad-hoc nova.
- **D-F6.2 — Export de auditoria como Route Handler.** O download (JSON|CSV) é um `GET`
  route handler com guarda `is_review_member` (401/403) + defesa-em-profundidade da RLS no
  `listAuditTrail`. JSON é o formato **sem perda**; CSV é achatado para planilha (RFC-4180,
  before/after JSON-stringificados na célula).
- **D-F6.3 — Estado de fila puro client-side, sem refetch.** A fila já vem inteira e
  virtualizada (Fatia 5); `queue-url.ts` serializa filtro/ordenação na URL e `applyQueueView`
  filtra/ordena em memória. Toda indexação do virtualizador/teclado/seleção foi roteada por
  `visibleRows` (com clamp de foco) para não dessincronizar a UI dos dados.
- **D-F6.4 — Trilho derivado de contadores + protocolo.** `computePhaseStates` é puro e
  testado; `loadPhaseStates` apenas reúne os insumos (pergunta, `protocol.state`, contadores).
  O protocolo travado é um estado de exibição distinto (`locked`) que **não** consome a
  fronteira "em curso".
- **D-F6.5 — Lógica pura extraída para testabilidade.** `summarizeUsage` (tokens) e os
  serializadores de auditoria foram isolados como funções puras, contornando a limitação de
  `cookies()` nos wrappers de servidor sob Vitest; os wrappers de servidor são cobertos pelos e2e.
- **D-F6.6 — Adaptação dos e2e ao novo shell (regressão de T8 corrigida).** A remoção da nav
  inline `Pergunta|Protocolo|Workbench` quebrou specs que navegavam pelo link "Workbench";
  `import`/`dedup`/`screening` passaram a navegar pelo trilho ("Importar") e a ler os contadores
  via a região `Contadores PRISMA`. Asserts obsoletos de `aria-disabled` (abas já habilitadas
  desde a Fatia 5) foram removidos. Intenção das asserções preservada.

## Correção sobre a fatia anterior

A pré-classificação de IA e os contadores parciais da Fatia 5 permanecem; a Fatia 6 apenas
**unifica** a exibição na fonte única e completa a `prisma_counter`.

## Verificação (evidência — executada no worktree)

```
npm run lint        → ✔ No ESLint warnings or errors
npm run typecheck   → tsc --noEmit, 0 erros
npm test (vitest)   → Test Files 38 passed (38) · Tests 139 passed (139)
npm run test:e2e    → 13 passed (1.1m)  [inclui shell-prisma ×3]
npm run build       → compila; rotas /reviews/[reviewId] e workbench como dinâmicas
```

Cobertura nova relevante: `tests/integration/prisma-counter.test.ts` (SC-004 + RLS),
`tests/integration/audit-export.test.ts` (SC-006 + RLS), `tests/integration/shell-usage.test.ts`,
`tests/unit/audit/export.test.ts`, `tests/unit/shell/phases.test.ts`,
`tests/unit/shell/shell-components.test.tsx`, `tests/unit/screening/queue-url.test.ts` (7),
`tests/e2e/shell-prisma.spec.ts` (3).

## Commits da fatia (16, no branch isolado)

`3ce67ec` plano → `e72ef87` views → `c1734ef`/`9789940` prisma queries → `f6582c7`/`1cf0596`
audit → `395e1bc` route → `95412ad` phases → `3de24a8` componentes → `691890f` jobs/usage →
`858e92a` shell no layout → `7fcca1a`/`76678ec` queue-url → `66c7c12` wiring fila →
`43976e0` e2e shell → `3d18fac` correção e2e (regressão T8).

## Processo

Executado via `superpowers:subagent-driven-development`: um subagente implementador por tarefa
(TDD), seguido de revisão de conformidade com a spec e revisão de qualidade de código; correções
re-revisadas. Parada obrigatória em CHECKPOINT 3 — **a sessão não fez `git merge` nem `git push`**.

## Próximo passo (desenvolvedor)

Revisar o diff do branch, conferir a suíte, e fazer o **merge manual** em
`001-marco1-nucleo-fluxo`. Como esta é a última fatia, o **Marco 1 fica completo** após o merge.
