# COMPLETION — Fatia 3: Workbench shell + Importação & registro de busca

**Feature:** `001-marco1-nucleo-fluxo` · **Marco 1** · **Fatia 3 de 6**
**Branch:** `build/001-marco1-nucleo-fluxo/3-workbench-importacao`
**Data:** 2026-06-01

---

## User Stories entregues

- **US2 — Importar referências e registrar a busca no workbench**: superfície única
  do workbench com o modo **Importar** funcional — registro de busca (string/base/
  data/hits) + importação RIS/BibTeX/CSV com pré-visualização client-side, sobre
  infra de jobs assíncronos (enqueue valida → worker persiste por-item).

## Requisitos funcionais cobertos

| FR | Descrição | Onde |
|----|-----------|------|
| FR-013 | Importar RIS/BibTeX/CSV | `_shared/import/{ris,bibtex,csv}.ts` + `index.ts` |
| FR-014 | Pré-visualização com mapeamento de campos antes de confirmar | preview client-side em `ImportPanel`/`ImportPreview`; CSV `fieldMap` |
| FR-015 | Registrar string/base/data/hits | `search` (mig 0003) + `searchSchema` + `create_import_job` |
| FR-016 | Malformado ⇒ erro claro, zero persistência parcial | parse valida no enqueue → `EnqueueValidationError` antes de qualquer escrita; teste de integração |
| FR-017 | Importação grande sem bloquear; progresso visível | job assíncrono + `JobProgress` (polling TanStack Query) |
| FR-027 | Workbench = superfície única por modos (sem telas separadas) | uma rota `workbench/`; `ModeBar` com Importar ativo e demais inertes (`aria-disabled`) |
| A3 | Libs de parsing pinadas (tarefa explícita) | `papaparse`, `@retorquere/bibtex-parser` v10, RIS próprio |

Transversais tocadas: **§VIII** (enqueue/worker separados, por-item, retomável,
idempotente), **SC-009** (RLS das tabelas novas), **Princípio III** (auditoria nas RPCs).

## Decisões de implementação (D-F3.*)

- **D-F3.1** — Núcleo portátil (`supabase/functions/_shared/`) + Edge Functions reais como casca; gates exercitam o núcleo (Vitest contra Postgres local + gatilho server-side), sem Deno no host nem cron.
- **D-F3.2 [DESVIO]** — Núcleo de import/jobs vive em `supabase/functions/_shared/` (não `src/lib/import/`), pois o deploy Deno não alcança `src/`. App importa via alias `@shared/*`.
- **D-F3.3 [DESVIO]** — `tsconfig` exclui `supabase/functions` do `tsc` do host (globais Deno); o núcleo `_shared` é checado transitivamente via `src/app`.
- **D-F3.4** — Parse valida no **enqueue** (malformado ⇒ rejeição, zero persistência); persistência (`record`) no **worker**, por-item.
- **D-F3.5** — Worker em produção: `pg_cron`→`pg_net`→`jobs-worker` (mig 0004, guardada). Local/e2e: Server Action `runImportWorker` (mesmo núcleo).
- **D-F3.6** — A3: `papaparse` (CSV) + `@retorquere/bibtex-parser` **v10** (BibTeX) + RIS próprio + `@tanstack/react-query`. (deno.json alinhado a v10 — paridade Node/Deno.)
- **D-F3.7** — App chama a Server Action `enqueueImport` sobre o mesmo núcleo do `jobs-enqueue`.
- **D-F3.8** — PRISMA "identificados" mínimo = `count(record)` no cabeçalho do workbench (view `prisma_counter` completa = Fatia 6).

## Achados do code review (final) — resolvidos

Review final (multi-arquivo) confirmou os invariantes (superfície única, split
enqueue/worker, FR-016 sem persistência parcial, RLS, sem `any`). Corrigidos antes
do checkpoint:

- **#1 (Critical) — corrida de duplicação no worker** sob cron concorrente: resolvido
  com **chave de idempotência** `record.job_item_id` (índice único parcial) +
  `insert_import_record ... on conflict do nothing`. Teste de integração "re-run
  idempotente" prova: rodar o worker 2× não duplica records.
- **#2/#4 (Important)** — `attempts` agora **incrementa**; `status`/`progress` do job
  **derivados das contagens no banco** (corretos em re-execução/parcial).

Itens menores (#5–#9: split de autores CSV, key por índice no preview, colunas
`*_cost` de forward-declaration) registrados como follow-ups; sem impacto funcional.

## Portões de qualidade (saída literal)

```
===== UNIT + INTEGRATION (npm test) =====
 Test Files  22 passed (22)
      Tests  71 passed (71)
   (inclui: import 23 unit · jobs.import 5 · rls.record-search-job 3 · workbench 2;
    herdados das Fatias 1–2 intactos)

===== TYPECHECK (tsc --noEmit) =====
(sem saída — limpo)

===== LINT (next lint) =====
✔ No ESLint warnings or errors

===== E2E (Playwright, prod build) =====
Running 5 tests using 1 worker
  ✓ auth.spec.ts (×2) · review-switch.spec.ts · smoke.spec.ts
  ✓ import.spec.ts — importar RIS: preview, registrar busca, confirmar, identificados sobem
  5 passed
```

Cobertura nova: parsers (≥80%, constitution §Testes) via fixtures válidas/malformadas
+ `fieldMap`; jobs por-item + idempotência + resiliência; RLS SC-009.

## Diferido explicitamente para fatias seguintes

- **Modos Duplicatas / Título-Resumo / Texto completo** (presentes-mas-inertes) → Fatias 4/5.
- **`ai_screening_batch`** (worker reusa a infra desta fatia) → Fatia 5.
- **View `prisma_counter` completa, trilho de fases, export de auditoria** → Fatia 6.
- **Edge Functions Deno exercitadas em runtime** → verificadas no deploy (núcleo 100%
  testado em Node; cron real só em produção, mig 0004 guardada localmente).
- Follow-ups menores #5–#9 do review.

## CHECKPOINT 3 — aguardando merge manual

Conforme `CLAUDE.md` §5: a sessão **não** faz merge/push. O desenvolvedor revisa o
diff do branch `build/001-marco1-nucleo-fluxo/3-workbench-importacao` e faz o merge
manualmente antes de qualquer próxima fatia (Fatia 4 — Deduplicação).
