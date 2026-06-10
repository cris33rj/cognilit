# Fatia 3 — Formulário de extração configurável (US2) — COMPLETION

**Branch:** `build/002-marco2-coracao-ai-first/3-formulario-extracao` (tip `a076414`)
**Base:** feature HEAD `45a3881` (Fatia 2 mergeada + IMPLEMENTATION_PLAN da Fatia 3)
**Estado:** ✅ Completa, aguardando **merge manual** (CHECKPOINT 3).

## O que foi entregue

O **instrumento de extração configurável** (US2): cada Revisão tem **um único**
formulário (`extraction_form`, 1:1) cujos **campos tipados** (`extraction_field` —
`text | number | date | boolean | select`) o pesquisador **monta, edita, remove e
reordena**. Toda mutação passa por **RPC `security definer`** que valida pertencimento,
valida o campo e grava `audit_entry` atômico (ator `human`) — espelhando
`lock_protocol`/`ensure_exclusion_reasons` do Marco 1. A RLS concede **só `select`** a
membros; nenhuma escrita direta contorna a RPC auditada. **Sem IA** — é a fundação que a
Fatia 4 (extração por IA) consome.

A remoção é **soft-delete** (`is_active=false`, nunca `DELETE`): honra o edge case
"editar/remover **não apaga silenciosamente** `extraction_value` validado" como **seam
forward-safe** — `extraction_value` nasce na Fatia 4 e nunca apontará para linha apagada.

## Tarefas (10) — TDD, com review por etapa

| # | Entrega | Commit |
|---|---------|--------|
| 1 | Migração 0014: enum `extraction_field_type` + `extraction_form` (1:1) + `extraction_field` (CHECKs) + RLS `select` | `4f27f4c` |
| 2 | RPC `ensure_extraction_form` (1:1 idempotente, auditada) | `b7f82a2` |
| 3 | RPC `add_extraction_field` + validação (`name`/`select⇒options`) + audit | `299eea0` |
| 4 | RPC `update_extraction_field` + audit before/after | `e2d5717` |
| 5 | RPC `remove_extraction_field` — soft-delete + audit | `e87e8a7` |
| 6 | RPC `reorder_extraction_fields` (`unnest … with ordinality`) + audit | `b17f6d1` |
| 7 | `src/lib/extraction/queries.ts` (`getExtractionForm` + `listExtractionFields`, deps-injected) | `e2fb4d1` |
| 8 | `src/lib/extraction/schema.ts` (Zod + `FIELD_TYPES`/labels) + Server Actions | `9447c6c` |
| 9 | `ExtractionFormBuilder` (client) + página `extraction/` (server) | `7625845` |
| 10 | Teste de isolamento RLS cross-review (SC-011) | `a076414` |

Correção de review aplicada dentro do ciclo: `b70c6d3` (satisfazer
`noUncheckedIndexedAccess` no teste — `audit![0]!.entity_id`).

Reviews two-stage (spec→qualidade) por subagente: cluster de RPCs (2–6), camada TS (7–8),
componente+página (9) — todas **APROVADAS**.

## Portões (CHECKPOINT 3) — evidência (HEAD `a076414`)

- `npx vitest run` → **66 arquivos / 283 testes**; 282 verdes. A única falha é o
  `pdf-pipeline.test.ts` por **timeout flaky sob carga do suite cheio** (5000ms) — **passa
  4/4 em isolamento** (pré-existente da Fatia 2, não tocado aqui). Baseline da Fatia 2 era
  62/263; a Fatia 3 adicionou **4 arquivos / +20 testes** (`extraction-form` 10,
  `rls.extraction` 2, `schema` 6, `form-builder` 2).
- `npm run lint` → ✔ No ESLint warnings or errors
- `npx tsc --noEmit` → 0 erros

## Cobertura de requisitos

- **FR-009** campos tipados (5 tipos) + nome + ordenação — enum `extraction_field_type`,
  `add_extraction_field` (append `sort_order=max+1`), `reorder_extraction_fields`, builder.
- **FR-010** editar/remover com mudança registrada — `update`/`remove` RPC + `audit_entry`.
- **FR-011** **um único** form por Revisão (`extraction_form.review_id UNIQUE` +
  `ensure_extraction_form`); engine genérica, sem nada AI-específico (reaproveitável p/
  viés/CERQual como instrumentos futuros, **não** implementados aqui).
- **FR-029** auditoria append-only de "configurar formulário" — toda RPC grava `audit_entry`
  `human` + `auth.uid()` + before/after.
- **Edge "não apaga `extraction_value` validado"** — soft-delete `is_active` (seam p/ F4).
- **`select` exige opções; `name` não-vazio** — CHECK no schema + `raise` nas RPCs + Zod.
- **SC-011 isolamento por Revisão** — RLS `select` por membro + membership nas RPCs;
  `rls.extraction.test.ts` (não-membro não lê form/fields; RPC de não-membro → `not a member`).
- **pt-BR na UI** — `FIELD_TYPE_LABELS` + textos do builder.

## Não-regressão (Princípio V)

Estritamente **aditivo**: migração **0014** aditiva; novo módulo `src/lib/extraction/`;
nova rota `app/reviews/[reviewId]/extraction/`. **Não** toca workbench/triagem/`screening`/
`import`; **não** altera `phases.ts` (o `PhaseKey` "Extração" é da Fatia 4); **não** importa
IA/embeddings/`job`. Suíte do Marco 1 + Fatias 1–2 segue verde.

## Decisões de design e desvios do plano (registrados)

- **`sort_order` (não `order`)** — palavra reservada; convenção `exclusion_reason`.
- **Soft-delete `is_active`** — seam forward-safe para a FK de `extraction_value` (Fatia 4).
- **Mutação só por RPC auditada** (RLS dá só `select`) — padrão atômico do Marco 1.
- **Sem fiação do `PhaseRail`** — página alcançável por URL agora; a F4 a insere no trilho.
- **Desvio na UI (Tarefa 9):** o formulário "Novo campo" foi colocado atrás de um **toggle
  de divulgação progressiva** (`showForm`, oculto por padrão; botão "Adicionar campo" revela
  o form com submit "Salvar campo" + "Cancelar"). Surgiu para resolver uma ambiguidade do
  teste (`getByText(/Número/)` casava o rótulo do campo **e** uma `<option>` do `<select>`).
  Revisado e aprovado: fluxo de adição íntegro ponta-a-ponta, padrão de UX padrão, toggle e
  submit são botões distintos. **Difere do mock do plano** (form sempre visível).
- **`onUpdate` no contrato do builder, ainda não cabeada** (`void onUpdate` documentado) —
  reservada para edição inline / re-extração na Fatia 4 sem mudar a assinatura.

## Fora desta fatia / pendências sinalizadas

- **Edição inline de campo na UI** — a RPC `update_extraction_field` existe e é testada; o
  builder ainda não expõe edição (só add/remove/reorder). `onUpdate` já está no contrato.
- **Regra "não desativar campo com `extraction_value` validado"** — entra na Fatia 4 junto
  com a tabela `extraction_value` e sua FK.
- **Fiação da fase "Extração" no `PhaseRail`** (`phases.ts`) — Fatia 4.
- Extração por IA (F4), lote+custo (F5), busca semântica/RAG (F6) — fora do escopo.

## Infra do worktree (notas)

- Worktree em `.worktrees/build+002-marco2-coracao-ai-first+3-formulario-extracao`, criado a
  partir do HEAD da feature (`45a3881`) via `git worktree add … HEAD`, sessão entrada via
  `EnterWorktree path:`. `.env.local` copiado; `npm install`; `supabase db reset` aplicou
  0001–0014. Shebang do husky correto.
