# COMPLETION — Fatia 5: Triagem em duas etapas + IA-no-laço

**Feature:** `001-marco1-nucleo-fluxo` · **Marco 1** · **Fatia 5 de 6**
**Branch:** `build/001-marco1-nucleo-fluxo/5-triagem`
**Data:** 2026-06-02

---

## User Stories entregues

- **US4 — Triar em duas etapas no workbench**: na superfície única, dois novos **modos**
  (**Título/Resumo** e **Texto completo**) apresentam filas **densas, virtualizadas e
  teclado-first**. O humano decide **incluir/excluir/dúvida** (motivo de exclusão
  obrigatório **só** no Texto completo, de lista configurável por Revisão). A IA
  **pré-classifica em lote assíncrono** (estimativa de custo prévia, sugestões anexadas,
  estado visual distinto) e **nunca decide**. A 1ª decisão de triagem **trava o protocolo**.
  Toda decisão e reversão é por item e auditada.

## Requisitos funcionais cobertos

| FR | Descrição | Onde |
|----|-----------|------|
| FR-022 | Triagem em dois modos (T/R e Texto completo) | `ModeBar` ativa `title_abstract`/`full_text`; `workbench/page.tsx` renderiza `ScreeningQueue` por `stage` |
| FR-023 | Incluir/excluir/dúvida por teclado; "dúvida" pendente (Q1) | RPC `decide_screening` (`maybe`→`maybe_ts`, bloqueia avanço); `ScreeningQueue` atalhos `i/e/d`, `j/k` |
| FR-024 | IA pré-classifica em lote, **nunca** altera estado | job `ai_screening_batch` + `src/lib/screening/worker.ts` (chama `LLMProvider.preclassifyScreening`, grava `ai_suggestion`/`ai_usage`, **não toca `record`**) |
| FR-025 | Motivo de exclusão só no Texto completo, lista configurável | `exclusion_reason` + `seed_default_exclusion_reasons`; CHECK `screening_ft_reason_required` + validação na RPC; UI: seletor + botão "Confirmar exclusão" |
| FR-026 | Desfazer triagem por item, a qualquer momento, nova `audit_entry` | RPC `reverse_screening`; `list_screening_queue.decision_id` + botão **"Desfazer"** na fila → `reverseScreening` |
| FR-028 | Filas densas teclado-first, virtualizadas (~5.000) | `ScreeningQueue` com `@tanstack/react-virtual`; legenda de atalhos visível |
| FR-033 | Estimativa de custo prévia + consumo acumulado | `enqueueScreeningJob` → `estimateScreeningCost(itemCount)`; `ai_usage(phase='screening')` por item |
| FR-039 | Seleção múltipla + ações em lote (decisões humanas, mesmas regras) | `ScreeningQueue` tecla `x`/checkbox + barra de lote → `decideScreening` por item |
| FR-040 | Densidade configurável (compacto/confortável) | `DENSITIES` em `config.ts`; seletor de densidade alimenta `rowHeight` da virtualização |
| FR-041 | a11y: ARIA grid/row/gridcell, foco visível, 100% teclado | `ScreeningQueue` (`role=grid/rowgroup/row/gridcell`, `aria-current`, foco visível); e2e `screening-a11y` |
| FR-010 | 1ª decisão de triagem trava o protocolo | `decide_screening` chama `lock_protocol` na 1ª `screening_decision` (guardado por existência de protocolo) |

Contadores PRISMA parciais (Fatia 5): **Triados** (`countScreened` — `ts_decision ∈ {included,excluded}`) e **Incluídos no Texto completo** (`countIncludedFullText`) no cabeçalho do workbench. View `prisma_counter` completa → Fatia 6.

Transversais reforçadas: **SC-003** (decisão 100% teclado), **SC-005** (sugestão de IA com estado explícito + distinta do dado humano, nunca decide), **SC-007** (exclusão TC sempre com motivo — CHECK + validação), **SC-008** (estimativa + consumo de IA), **SC-009** (RLS de `exclusion_reason` + `screening_decision`), **SC-012** (fila responsiva ~5.000 — virtualização provada), **SC-013** (a11y), **Princípio I/III/IV/VIII**.

## Decisões de implementação (D-F5.*)

- **D-F5.1** — Toda mutação de estado de triagem é **RPC Postgres `security definer`** (`0006_screening.sql`), atômica + auditável + testável em Node, espelhando Fatias 3/4.
- **D-F5.2** — `decide_screening` valida (TC exige `ts_decision='included'` — Q1; `maybe` proibido no TC; `exclude` no TC exige motivo — FR-025), transiciona `record` (ts/ft + `corpus_state`), e na 1ª decisão chama `lock_protocol` **se houver protocolo** (FR-010). Mapeamento `screening_choice`→`ts/ft_decision_state` só dentro da RPC.
- **D-F5.3** — `reverse_screening` restaura o estado anterior da etapa (T/R→`active`; TC→`included_ts`), marca `is_reversed`+`reversed_at`, não apaga a decisão, grava **nova** `audit_entry`.
- **D-F5.4** — `exclusion_reason` é lista configurável por Revisão; `seed_default_exclusion_reasons` é **idempotente** (semeia 7 motivos padrão só se vazia), chamada ao carregar o modo Texto completo.
- **D-F5.5** — `ai_screening_batch` reusa a infra de jobs (Fatia 3). O processamento (`src/lib/screening/worker.ts`) chama `LLMProvider.preclassifyScreening` por item, grava `ai_suggestion(target_kind='screening')`+`ai_usage`, resiliente por-item. Provider injetado; `runScreeningWorker` resolve via `getLLMProvider` e, sem BYOK (local/e2e), cai para `MockLLMProvider` determinístico.
- **D-F5.6** — Estimativa de custo prévia (FR-033) via `estimateScreeningCost(itemCount)` (puro, sem decifrar BYOK).
- **D-F5.7** — Fila virtualizada (**`@tanstack/react-table` + `@tanstack/react-virtual`**, dependências novas pinadas por tarefa explícita — R7/A3), teclado-first, com orçamento A2 como critério e2e.
- **D-F5.8** — Ações em lote são decisões humanas pela mesma `decideScreening` por item; densidade compacto/confortável; a11y ARIA/foco/teclado.

## Orçamento de performance — item A2 (SC-012)

Limiares-alvo: decisão→render < 100 ms; nav por tecla < 50 ms; render inicial < 1 s (5.000); scroll fluido. Invariante **dura** verificada em e2e (`screening-perf.spec.ts`): com **5.000 registros** no banco, o nº de linhas no DOM permanece **< 200** (virtualização real), a fila renderiza dentro da margem e a navegação por tecla responde. (Limiar vive aqui — HANDOFF A2; `spec.md` sign-off não alterado.)

## Achados de code review — resolvidos

Tarefas de lógica (migração/RPC/worker/componente) passaram por revisão de spec + qualidade; correções aplicadas antes do checkpoint:

- **Plano ausente no worktree (T1)** — o worktree foi criado de `55001d5` (plano da Fatia 4); o plano da Fatia 5 estava só na working tree principal. Corrigido: plano + slicing copiados e commitados na branch da fatia (`c439e17`) **antes** de prosseguir; a migration da T1 foi **realinhada ao plano** (`sort_order` em vez do reservado `order`; 7 motivos; sem policy de `delete`; seed idempotente "if exists → return").
- **decide_screening (T3)** — revisão confirmou validações Q1/FR-025, mapeamento de enums e lock guardado por existência de protocolo; nota menor (race de `v_first` em concorrência) mitigada pela idempotência de `lock_protocol`.
- **worker de IA (T8)** — confirmado que **não** muta `record` (FR-024); resiliência por-item; recomputa status/progresso do job.
- **Server Actions (T9)** — **desvio corrigido**: `eligibility_criterion` tem coluna `text` (não `label`); `runScreeningWorker` usa `select("text")`.
- **ScreeningQueue (T11)** — **gaps corrigidos**: (a) `SuggestionChip` só aceita `state` (não `children`) — adaptado preservando o contrato visual (SC-005); (b) **FR-025 mouse path**: adicionado botão "Confirmar exclusão" após escolher o motivo; (c) **FR-026 UI**: `list_screening_queue` passou a expor `decision_id` (última decisão viva da etapa), e a fila ganhou botão "Desfazer" que usa `onReverse`; (d) a11y: `role="rowgroup"` + `aria-current` para foco (sem sobrecarregar `aria-selected`).
- **e2e tsc (T13/14/15)** — extração de `reviewId` da URL estreitada para satisfazer `tsc --noEmit` strict (guard `if (!reviewId) throw`).

## Portões de qualidade (saída literal)

```
===== DB RESET (npx supabase db reset) =====
DB RESET OK  (migrations 0001..0006 aplicadas limpas)

===== UNIT + INTEGRATION (npm run test) =====
 Test Files  2 failed | 29 passed (31)
      Tests  110 passed | 3 skipped (113)
 → As 2 falhas são tests pré-existentes da Fatia 2 (protocol-draft, question-derivation)
   que chamam a API real da Anthropic e exigem ANTHROPIC_API_KEY no ambiente (ausente
   neste run local). Confirmado intocadas pela Fatia 5 (git diff 55001d5..HEAD vazio).
 → Testes da Fatia 5 (rodados isolados): 5 Test Files, 28 passed (28):
     screening (integração) · rls.screening · screening/config · screening/queries · screening-queue (unit)

===== TYPECHECK (tsc --noEmit) =====
(exit 0 — limpo)

===== LINT (next lint) =====
✔ No ESLint warnings or errors

===== BUILD + E2E SCREENING (Playwright, prod build) =====
BUILD OK
Running 4 tests using 1 worker
  ✓ screening-a11y — operável por teclado e expõe ARIA (SC-013)
  ✓ screening-perf — ~5.000 registros: DOM virtualizado (< 200 linhas)
  ✓ screening — triagem T/R: incluir por teclado e contador sobe
  ✓ screening — Texto completo: excluir exige motivo (FR-025)
  4 passed
```

Cobertura nova de triagem (constitution §Testes): 5 RPCs em integração (decide T/R + TC + lock na 1ª; reversão + dupla-reversão bloqueada; fila + job de IA); worker de IA (sugestão anexada, **estado não muda** — FR-024); RLS SC-009; config + queries unit; componente `ScreeningQueue` (teclado, gate de motivo, lote, desfazer); e2e fluxo + perf + a11y.

## Diferido explicitamente para a Fatia 6

- **FR-029 (SHOULD)** — ordenação opcional da fila (incl. por pontuação da IA) e filtros por estado/fonte/termo. **Não** implementado nesta fatia (é SHOULD, não MUST); registrado aqui para decisão na Fatia 6.
- **View `prisma_counter` completa, trilho de fases, estado de fila na URL (FR-037), export de auditoria (FR-035, A1)** → Fatia 6.
- **Worker de IA em produção via Edge `jobs-worker` (Deno):** o Marco 1 dispara o worker de triagem **sincronamente** (Server Action `runScreeningWorker`, espelhando `runImportWorker` — D-F3.5/D-F5.5). A integração do `ai_screening_batch` no `jobs-worker` agendado por `pg_cron` é trabalho de produção pós-Marco (a chamada ao `LLMProvider` Node não roda no Deno edge sem adaptação).

## CHECKPOINT 3 — aguardando merge manual

Conforme `CLAUDE.md` §5: a sessão **não** faz merge/push. O desenvolvedor revisa o diff
do branch `build/001-marco1-nucleo-fluxo/5-triagem` e faz o merge manualmente antes da
próxima fatia (Fatia 6 — Shell, trilho & PRISMA vivo + export de auditoria).
