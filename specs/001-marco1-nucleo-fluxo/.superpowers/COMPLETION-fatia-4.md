# COMPLETION — Fatia 4: Deduplicação no workbench

**Feature:** `001-marco1-nucleo-fluxo` · **Marco 1** · **Fatia 4 de 6**
**Branch:** `build/001-marco1-nucleo-fluxo/4-deduplicacao`
**Data:** 2026-06-02

---

## User Stories entregues

- **US3 — Deduplicar o corpus no workbench**: no **modo Duplicatas** da superfície única,
  as duplicatas exatas são removidas automaticamente ao concluir a importação (com log
  reversível), e os pares **fuzzy** (similaridade de título ≥ 0.92 + mesmo ano) são
  apresentados lado a lado para decisão humana **mesma** (mescla) / **distintas**. Toda
  decisão e reversão é registrada na trilha append-only.

## Requisitos funcionais cobertos

| FR | Descrição | Onde |
|----|-----------|------|
| FR-018 | Remover exatas automaticamente (DOI; senão title_norm+ano) | RPC `dedup_exact` (`0005_dedup.sql`); disparo automático em `runImportWorker` |
| FR-019 | Toda remoção automática reversível + auditada | `dedup_exact` grava `dedup_decision(exact_auto)` + `audit_entry`; `reverse_dedup` |
| FR-020 | Pares fuzzy lado a lado, mesma/distintas | RPC `list_fuzzy_candidates` (≥0.92 + mesmo ano) + `decide_fuzzy`; UI `DuplicatesPanel` (par lado a lado, grid 2 colunas) |
| FR-021 | Mescla fuzzy registrada + reversível | `decide_fuzzy(merged)` → `duplicate_fuzzy` + `dedup_decision(fuzzy_human)`; `reverse_dedup` |
| FR-026 | Desfazer qualquer decisão, a qualquer momento, como nova `audit_entry` | `reverse_dedup` (não apaga; marca `is_reversed` + nova `audit_entry`); Server Action `reverseDedup` + botão "Desfazer" |
| FR-027 (transversal) | Modo na superfície única, sem rota nova (Princípio V) | `ModeBar` ativa `duplicates`; `workbench/page.tsx` renderiza `DuplicatesPanel` em `?mode=duplicates` |

PRISMA "duplicados" mínimo (D-F4.7): `countDuplicates` (removed+merged não revertidos) + contador no cabeçalho do workbench.

Transversais reforçadas: **SC-009** (RLS de `dedup_decision`), **Princípio III** (toda mutação grava `audit_entry`), **Princípio IV** (migration + RLS primeiro).

## Decisões de implementação (D-F4.*)

- **D-F4.1** — Toda a lógica de dedup é **RPC Postgres `security definer`** (não código Deno), atômica + auditável + testável em Node, espelhando a Fatia 3. O worker Deno não foi editado.
- **D-F4.2** — `dedup_exact` é **idempotente**: opera só sobre `corpus_state='active'`; promove `imported→active`; re-rodar não re-marca nem duplica decisões.
- **D-F4.3** — Dedup exato dispara **automaticamente ao concluir a importação** (estendendo `runImportWorker`); também exposto como Server Action `runExactDedup` (re-execução manual idempotente).
- **D-F4.4** — Chave exata: `doi_normalized`; na ausência, `title_norm` + `metadata->>'year'` (R2). Sobrevivente = mais antigo (`created_at, id`).
- **D-F4.5** — Fila fuzzy: `similarity(title_norm)` (pg_trgm **simétrico**, R2) **≥ 0.92** + mesmo ano, entre `active`, excluindo pares já decididos. Limiar canônico em `DEDUP_FUZZY_HIGH` (`src/lib/dedup/config.ts`), passado à RPC.
- **D-F4.6** — Reversão **por item, a qualquer momento** (Q4): `is_reversed=true`+`reversed_at`, restaura `record_b`→`active`, e grava **nova** `audit_entry`.
- **D-F4.7** — Contador PRISMA "duplicados" mínimo = `dedup_decision(outcome∈{removed,merged}, is_reversed=false)`. View `prisma_counter` completa fica na Fatia 6.
- **D-F4.8 [PERF]** — `list_fuzzy_candidates` usa o operador pg_trgm `%` (similaridade **simétrica**, GIN-index `record_title_trgm_idx`) como pré-filtro via `CROSS JOIN LATERAL`, com `set_config('pg_trgm.similarity_threshold', p_threshold, true)` e recheck exato `similarity() >= p_threshold`. Evita o self-join O(n²) (que projetava ~9 min em 5.000 registros) mantendo a semântica de R2.

## Achados de code review — resolvidos

Cada tarefa passou por revisão de **spec** + **qualidade**; correções aplicadas antes do checkpoint:

- **dedup_decision (T1)** — adicionadas CHECK constraints: `dedup_distinct_pair` (record_a ≠ record_b), `dedup_reversed_consistency` (is_reversed ⟺ reversed_at), `dedup_similarity_range` (0..1).
- **dedup_exact (T2)** — cobertura do caminho de fallback `title_norm+year` (sem DOI); comentário de pré-condição (chamado pós-import).
- **reverse_dedup (T3)** — `for update` (lock contra reversão concorrente duplicando auditoria) + `if not found` idiomático.
- **list_fuzzy_candidates (T4)** — **desvio corrigido**: revertido `word_similarity` → `similarity()` simétrico (R2); correção crítica de performance (D-F4.8).
- **decide_fuzzy (T5)** — valida que ambos os records pertencem à Revisão; `merged` exige `record_b` ativo (sem no-op silencioso que mentiria na auditoria); `before` da auditoria captura o estado anterior.
- **queries (T6)** — `listExactRemovals` escopada a `record_b_id` não-nulo.
- **Server Actions (T7)** — `dedup_exact` em `runImportWorker` agora propaga erro (não engole).
- **DuplicatesPanel (T9)** — guarda de `pending` + `try/catch` + exibição de erro (espelha `ImportPanel`).
- **e2e (T11)** — timeout explícito após troca de modo; assert dos dois títulos do par; `import.spec.ts` atualizado para a invariante pós-Task-8 (Duplicatas habilitada).
- **Revisão holística final** — `DEDUP_FUZZY_HIGH` passou a ser o limiar canônico (passado à RPC); READY TO MERGE, sem blockers.

## Portões de qualidade (saída literal — commit `fdd56be`)

```
===== UNIT + INTEGRATION (npm run test) =====
 Test Files  26 passed (26)
      Tests  85 passed (85)
   (inclui: dedup 9 integração · rls.dedup 1 · dedup config 1 unit · duplicates-panel 3 unit;
    herdados das Fatias 1–3 intactos)

===== TYPECHECK (tsc --noEmit) =====
(exit 0 — limpo)

===== LINT (next lint) =====
✔ No ESLint warnings or errors

===== BUILD + E2E (Playwright, prod build) =====
Running 6 tests using 1 worker
  ✓ auth (×2) · review-switch · smoke · import
  ✓ dedup.spec.ts — exatas auto-removidas, par fuzzy confirmável, contador sobe
  6 passed
```

Cobertura nova: dedup ≥80% (constitution §Testes) via testes de integração das 4 RPCs (exatas auto + idempotência + fallback; reversão + dupla-reversão bloqueada; fila fuzzy ≥0.92 + mesmo ano; merged/kept_distinct + saída da fila); RLS SC-009; painel (render + pending + erro); e2e ponta-a-ponta.

## Diferido explicitamente para fatias seguintes

- **Modos Título/Resumo e Texto completo** (presentes-mas-inertes) → Fatia 5.
- **Triagem + `ai_screening_batch` + travamento do protocolo na 1ª decisão** → Fatia 5.
- **View `prisma_counter` completa, trilho de fases, estado de fila na URL, export de auditoria** → Fatia 6.

## CHECKPOINT 3 — aguardando merge manual

Conforme `CLAUDE.md` §5: a sessão **não** faz merge/push. O desenvolvedor revisa o diff
do branch `build/001-marco1-nucleo-fluxo/4-deduplicacao` e faz o merge manualmente antes
da próxima fatia (Fatia 5 — Triagem em duas etapas + IA-no-laço).
