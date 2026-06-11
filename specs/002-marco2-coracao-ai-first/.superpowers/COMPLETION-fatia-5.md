# Fatia 5 — Extração em lote + estimativa de custo + consumo (US4) — COMPLETION

**Branch:** `build/002-marco2-coracao-ai-first/5-extracao-lote` (tip `ee96582`)
**Base:** feature HEAD `82bf085` (F1–F4 mergeadas + edição do IMPLEMENTATION_PLAN da Fatia 5; F4 mergeada em `925ba7c`)
**Estado:** ✅ Mergeada na feature branch — merge `7d87f88` (2026-06-11).

## O que foi entregue

A **extração por IA em lote** (US4): sobre uma seleção de estudos elegíveis (`record`
`corpus_state='included_ft'` **com PDF processado** — `document.processing_status ∈
{text_ready, partial}`), o pesquisador dispara a extração como **job assíncrono**
(`ai_extraction_batch`), com **estimativa de custo/tokens antes + confirmação** (FR-022),
progresso visível, **retomável** e **resiliente a falha por-item** (FR-021). O **consumo
acumulado por Revisão e por fase** fica visível no shell (FR-023). Sem 1ª chave BYOK ⇒
sinaliza e **não trava** — a extração single da Fatia 4 segue disponível.

Espelha a infra de lote do Marco 1 (screening): enqueue via **RPC `security definer`**
(`create_extraction_job`, espelha `create_screening_job`); worker **server-side Node**
(decisão A1) que itera item-a-item, cada item = **um estudo**, reusando
`runExtractionForRecord` da Fatia 4 e gravando `ai_usage(phase='extraction')`. **Sem
embeddings** (RAG → F6). **Nenhuma dependência nova** (Voyage/pgvector ficam na F6).

## Tarefas (9, executadas via subagent-driven-development) → commits

| # | Entrega | Commit(s) |
|---|---------|-----------|
| 1 | Migração 0016: `ALTER job_type ADD 'ai_extraction_batch'` (aditivo) + RPC `create_extraction_job` (enqueue + `audit_entry`) | `5503975`, `9edee45` (review M3) |
| 2 | `enqueueExtractionJob` via RPC `create_extraction_job` | `0d27f96` |
| 3 | `processExtractionJob` — por-item resiliente/retomável + `ai_usage` | `e6df744` |
| 4 | `runExtractionBatchWorkerWith` — processa jobs ativos do lote (A1) | `88daa48` |
| 5 | `listExtractionBatchCandidates` (`included_ft` + PDF processado, dedupe) | `4f64441` |
| 6 | Consumo de IA **por fase** no shell (`summarizeUsageByPhase`, `JobsPanel`) | `3b2decb` |
| 7 | Server Actions `estimateExtractionBatch` + `runExtractionBatch` | `766469d` |
| 8 | `ExtractionBatchRunner` UI — seleção, estimativa, confirmação | `ec3dbf2` |
| 9 | Teste de isolamento RLS cross-review do lote (SC-011) | `ee96582` |

Cada tarefa passou por review de spec-compliance + qualidade por subagentes; correções
aplicadas inline (commit `(review)` na Task 1).

## Portões (CHECKPOINT 3) — evidência (merged HEAD `7d87f88`, pós `npm install`)

- `npx vitest run` → **76 arquivos / 320 testes — 320 verdes**. Baseline da Fatia 4 era
  73/310; a F5 adicionou **3 arquivos / +10 testes** (integration: `extraction-batch` 7
  testes, `rls.extraction-batch` 1; unit: `usage-by-phase` 2).
- `npm run lint` → ✔ No ESLint warnings or errors
- `npx tsc --noEmit` → 0 erros

> Nota de ambiente: o checkout principal precisou de `npm install` antes do `tsc` —
> `unpdf` (dep declarada na F2, package.json:33) não estava em `node_modules` do checkout
> principal (só nos worktrees das fatias). Não é defeito de código; após o install, tsc 0.

## Cobertura de requisitos (FR-021..023)

- **FR-021** lote assíncrono retomável/resiliente — `create_extraction_job` (job +
  `job_item` por estudo); `processExtractionJob` só pega itens `pending` (retomável),
  falha de 1 item ⇒ `job_item.status='failed'` + `attempts++` (não derruba o job); status
  final `completed`/`completed_with_errors`/`failed` + `progress`. Teste de integração
  prova item falho não bloqueia os demais.
- **FR-022** estimativa de custo/tokens **antes** + confirmação — Server Action
  `estimateExtractionBatch` (reusa `LLMProvider.estimateCost` kind `ai_extraction_batch`,
  contrato fixado na F4); `ExtractionBatchRunner` exibe a estimativa e exige confirmação
  antes de `runExtractionBatch`.
- **FR-023** consumo acumulado por Revisão e por fase — `summarizeUsageByPhase` agrega
  `ai_usage` por `phase` (`phase` é text, **sem ALTER**); `getJobsAndUsage` devolve
  `usageByPhase`; `JobsPanel` surface no shell. `processExtractionJob` grava
  `ai_usage(phase='extraction')` por item processado.
- **A1** worker server-side Node — `runExtractionBatchWorkerWith(admin, provider, …)`
  resolve provider (`getLLMProvider` / fallback `MockLLMProvider`), espelha
  `runScreeningWorker`; Edge `jobs-worker`/`pg_cron` **não** estendida.
- **Elegibilidade** — `listExtractionBatchCandidates` e o predicado da RPC mantidos em
  sincronia (`included_ft` ∧ PDF `text_ready|partial`); estudo com >1 PDF aparece uma vez.
- **Sem 1ª chave ⇒ não trava** — fallback `MockLLMProvider`/sinalização; extração single
  da F4 segue operável.
- **FR-029** auditoria — `create_extraction_job` grava `audit_entry`
  (`enqueue_extraction_batch`, `actor='human'`/`auth.uid()`, `item_count`).
- **SC-011** isolamento por Revisão — `rls.extraction-batch.test.ts`: lote de uma Revisão
  não vaza para outra (RLS + `is_review_member` na RPC).

## Não-regressão (Princípio V / Marco ≥ 2)

Estritamente **aditivo**: migração **0016** (enum aditivo + nova RPC); novo módulo
`src/lib/extraction/{enqueue,batch-worker,batch-run}.ts` + `listExtractionBatchCandidates`;
`usage.ts` **estende** sem alterar assinaturas-base de `summarizeUsage`/`getJobsAndUsage`
(campo `usageByPhase` novo + função nova); `actions.ts`/`page.tsx`/`JobsPanel.tsx` recebem
adições. **Não** toca screening/import/workbench/triagem/Fatias 1–4. **Nenhuma dependência
nova** (Voyage/pgvector ficam na F6). Reusa `runExtractionForRecord` (F4) e o vocabulário
visual de IA. Suíte do Marco 1 + Fatias 1–4 segue verde.

## Decisões de design (registradas)

- **`ai_usage.phase` é text — sem ALTER.** O consumo por fase (`extraction`) usa o campo
  existente; nada de enum novo.
- **Item = estudo; reuso de `runExtractionForRecord`.** O worker do lote não reimplementa
  extração — chama o lib single da F4 por estudo, herdando grounding/proveniência/not_found.
- **Predicado de elegibilidade duplicado mas sincronizado** (RPC SQL + `listExtraction
  BatchCandidates`): comentário cruzado em ambos exige manter os dois em sincronia.
- **`ai_usage` gravada com tokens 0/cost `{}` por item** nesta fatia — o pipeline de tokens
  reais do provider é instrumentação futura; a estrutura de agregação por fase já está pronta.

## Fora desta fatia / pendências sinalizadas (para o desenvolvedor / F6)

- **`ai_usage` com tokens reais:** hoje cada item grava `tokens_in/out=0`, `cost={}`. A
  agregação por fase (FR-023) está pronta; falta o provider devolver tokens reais por
  chamada de extração e o worker propagá-los. Hardening futuro.
- **Polimento not_found + "Aceitar"** (herdado da F4) — segue adiado; cosmético, sem risco
  de integridade.
- **Busca semântica / embeddings (US5)** → **Fatia 6** (última): `EmbeddingProvider` Voyage,
  2ª chave BYOK, pgvector + HNSW, `embedding_batch`. Itens A2/A3 a fixar lá.

## Infra do worktree (notas)

- Worktree em `.worktrees/build+002-marco2-coracao-ai-first+5-extracao-lote`, criado a
  partir do HEAD da feature via `git worktree add … HEAD` + `EnterWorktree path:`.
  `.env.local` copiado; `npm install`; `npx supabase db reset` aplicou 0001–0016; shebang
  do husky correto.
