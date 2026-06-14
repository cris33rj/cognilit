# Fatia 2 — Síntese qualitativa assistida (US1) — COMPLETION

**Branch:** `build/003-marco3-saida-sintese-relatorio/2-synthesis` (tip `51f3b79`)
**Base:** feature HEAD `30047e9` (Marcos 1–2 + Fatia 1 mergeada `82e8990`)
**Estado:** ✅ Completa e **mergeada** na feature `003-marco3-saida-sintese-relatorio`
(merge commit `a44fcba`, 2026-06-14, "geração da síntese"). CHECKPOINT 3 concluído —
dev fez o merge manual.

## O que foi entregue

**Síntese qualitativa assistida por IA** (US1): o pesquisador gera temas a partir dos
estudos `included_ft` com extração ratificada (`accepted`/`edited`), revisa/edita a
narrativa de cada tema e os ratifica (accept/edit/reject/merge/split/reorder), cada ação
com `audit_entry`. Todo tema é **ancorado em achados** (`theme_finding → extraction_value`,
grounding obrigatório §II); "dados insuficientes" é estado de 1ª classe (FR-007, sem
fabricação). Estimativa de custo antes do lote (FR-006). Saída **pt-BR**.

`synthesizeThemes(...)` passa pela abstração `LLMProvider` (Anthropic real + Mock
determinístico); o **worker Node** (`processSynthesisJob`) agrega achados item-a-item
(resiliente por-item, retomável), grava `ai_usage` phase `synthesis`, e na **regeneração
preserva** temas `accepted`/`edited` (FR-005a) reinserindo só os `pending`. A
**tabela-resumo** é estudos×campos, derivada de `theme_finding` e **recomputável** (A1).

## Tarefas — entrega (commits, `30047e9..51f3b79`, sem merge)

| Entrega | Commit |
|---------|--------|
| migration 0018 — synthesis/theme/theme_finding + RLS + RPCs (US1) | `bb83093` |
| `fix`: hardening das RPCs de síntese — guards + cast uuid (review T1) | `dc78a64` |
| `LLMProvider.synthesizeThemes` + estimate `synthesis_batch` (FR-001,006,007) | `11f6a88` |
| `fix`: parsing robusto do synthesizeThemes Anthropic + cost test (review T2) | `fb38432` |
| `buildThemeSummaryTable` estudos×campos recomputável (A1) | `41ff7db` |
| queries — pool de achados ratificados + candidatos + carga | `bc9ac35` |
| `fix`: embed `extraction_field` singular; throw em erro de query (review T4) | `391bf5e` |
| worker Node — enqueue + agrega temas/grounding resiliente (FR-005,005a,007) | `9912cf1` |
| `fix`: ai_usage no caminho insufficientData + testes regen-preservação (review T5) | `ddd62fd` |
| `fix`: integrity writes + recuperação de falha top-level no worker (review T5) | `3c8a118` |
| server actions — estimar/gerar + ratificação (FR-003,004,006) | `7f7e93e` |
| adiciona a fase Síntese ao trilho (`shell/phases.ts`) | `c02ab2e` |
| componentes (temas/narrativa/tabela/grounding/runner) reusando `ai/*` | `c09e06c` |
| `fix`: NotFound + refresh de narrativa + semântica de edição (review T8) | `d36c9b9` |
| página da síntese (Server Component + runner + estado insuficiente) | `a0c0240` |
| `fix`: carrega provenance real do `ai_suggestion` nos cards (FR-002) (review T9) | `6b401a2` |
| integração — RLS + regeneração preserva edições + grounding (SC-008/FR-005a/007) | `a2bd21d` |
| `fix`: synthesizeThemes Anthropic real + surface de estados não-ready | `b71846f` |

### Correções pós-build (revisão pré-merge, esta sessão)

| Entrega | Commit |
|---------|--------|
| `fix`: enfileira o job com a sessão do membro, não service-role ("not a member") | `163180b` |
| `test`: e2e de regressão da geração de síntese pelo membro (US1) | `e13fdc7` |
| `fix`: tabela-resumo renderiza o `.value` do final_value, não `[object Object]` | `51f3b79` |

## Arquivos (29 alterados, +3928 / −4)

- **Migration:** `supabase/migrations/0018_synthesis.sql`
- **LLM:** `src/lib/ai/llm/{types,anthropic,mock,cost}.ts`
- **Worker/lógica:** `src/lib/synthesis/{enqueue,batch-run,batch-worker,queries,summary-table}.ts`
- **Trilho:** `src/lib/shell/phases.ts`
- **UI:** `app/reviews/[reviewId]/synthesis/{page.tsx,actions.ts}`,
  `src/components/synthesis/{ThemeList,ThemeCard,NarrativeEditor,SummaryTable,GroundingRefs,InsufficientData,SynthesisRunner}.tsx`
- **Tipos:** `src/types/database.ts`
- **Testes:** `tests/unit/synthesis/{batch-worker,components}.test.tsx`,
  `tests/unit/ai/llm-contract.test.ts`, `tests/unit/shell/phases*.test.ts`,
  `tests/integration/synthesis.test.ts`, `tests/e2e/synthesis.spec.ts`

## Portões (CHECKPOINT 3)

CHECKPOINT 3 aprovado pelo dev (merge manual `a44fcba`). Cobertura: unit (grounding
obrigatório, insufficientData, componentes c/ mock LLM, contrato LLM, fase no trilho;
+2 testes da tabela-resumo objeto/não-encontrado), integration (RLS síntese/tema/grounding;
regeneração preserva `accepted`/`edited`) e **e2e** (membro gera a síntese pela UI sem
"not a member"). `tsc --noEmit` e `npm run lint` verdes; a integração só falha em timeout
quando a suíte inteira roda em paralelo contra o Postgres local único (passa isolada).

## Cobertura de requisitos

- **FR-001..007, FR-005a** geração, ratificação, regeneração-preservação, dados
  insuficientes, estimativa de custo — worker + actions + UI
- **FR-002** proveniência real do `ai_suggestion` nos cards
- **FR-024/FR-026** auditoria por ação + `ai_usage` phase `synthesis`
- **SC-001, SC-006(síntese), SC-007, SC-008(síntese)** — unit + integration
- **A1** `summary_table` estudos×campos, recomputável de `theme_finding`

## Não-regressão

Aditivo: `ai_target_kind`/`job_type` por `ALTER TYPE ... ADD VALUE` (sem recriar enum),
`ai_usage.phase` é `text` (insert, sem ALTER). Nenhuma view/tabela dos Marcos 1–2
alterada; extração/triagem/views PRISMA intocadas. `shell/phases.ts` ganha a fase
Síntese (aditiva).

## Fora desta fatia

Relatório (Fatia 3, que **embute a síntese ratificada** nos Resultados — A3),
checklist/características (Fatia 4) e exportações (Fatias 5–6).

## Notas de implementação

Aprendizado-chave registrado em memória: RPCs `SECURITY DEFINER` que checam
`is_review_member` (ex.: `create_synthesis_job`) **devem** ser chamadas com o cliente do
membro (RLS), nunca com o admin service-role — `auth.uid()` é NULL sob service_role e a
checagem levanta `not a member`. Os testes de integração não pegam isso (enfileiram com o
cliente do membro direto); só o e2e exercita a escolha de cliente do server action. O
mesmo padrão latente existe em `extraction/actions.ts:runExtractionBatch` (Marco 2) —
sinalizado para revisão separada. As fatias 3/5/6, que também enfileiram jobs, devem
seguir este padrão.
