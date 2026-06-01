# COMPLETION — Fatia 2: Pergunta + Protocolo (+ plumbing de IA/BYOK)

**Feature:** `001-marco1-nucleo-fluxo` · **Marco 1** · **Fatia 2 de 6**
**Branch:** `build/001-marco1-nucleo-fluxo/2-pergunta-protocolo`
**Data:** 2026-06-01

---

## User Stories entregues

- **US5 — Formular a Pergunta** com framework (SPIDER default + PICo/PEO/PCC/livre),
  derivação de critérios/termos por IA, ratificável (aceitar/editar/rejeitar).
- **US6 — Protocolo PRISMA-P**: rascunhar (IA) / editar / travar, com emendas
  versionadas e datadas e export Markdown.

## Requisitos funcionais cobertos

| FR | Descrição | Onde |
|----|-----------|------|
| FR-006 | Framework SPIDER default + alternativas | `question/schema.ts` + `QuestionForm` |
| FR-007 | Derivação de critérios/termos por IA | `deriveCriteria` action + `LLMProvider.deriveEligibility` |
| FR-008 | Ratificação aceitar/editar/rejeitar c/ estado | `ratifyCriterion` + `CriteriaPanel` |
| FR-009 | Rascunho PRISMA-P editável | `draftProtocol`/`saveProtocolDraft` + `ProtocolEditor` |
| FR-010 | Travar protocolo; estado visível | `lock_protocol` RPC + trigger + editor |
| FR-011 | Emenda versionada/datada, sem sobrescrever | `add_protocol_amendment` RPC + `AmendmentList` |
| FR-012 | Export do protocolo | `protocol/markdown.ts` + `export/route.ts` (Markdown — D-F2.1) |
| FR-030 | Estado de IA visível, distinto de humano | `SuggestionChip` + `state.ts` |
| FR-031 | Proveniência (modelo/versão/trecho/timestamp) | contrato `types.ts`; persistida; `ProvenancePopover` |
| FR-032 | BYOK cifrada; operar sem IA | Vault RPCs (`set_byok_key`/`get_byok_secret`) + `ByokKeyForm`; `MissingByokError` |
| FR-033 | Estimativa de custo (base) | `cost.ts` + `ai_usage` (consumo na UI da fila = Fatia 5) |
| FR-034 | `not_found` como resultado de 1ª classe | contrato + `NotFound` + render no painel |

## Decisões de implementação (D-F2.*)

- **D-F2.1** — Export do protocolo = **Markdown** (`.md`). PDF adiado ao Marco 3.
- **D-F2.2** — Escopo da chave BYOK = **por Revisão** (`review_id`).
- **D-F2.3** — Geração de IA = **Server Action síncrona single-shot** (sem Edge Function/jobs nesta fatia).
- **D-F2.4** — Decifragem da BYOK **estritamente server-side** (`get_byok_secret` só `service_role`).
- **D-F2.5** — Adapter Anthropic implementa a **interface completa** (5 métodos); consumo de `preclassifyScreening` = Fatia 5.
- **D-F2.6** — Esta fatia entrega a **operação** de lock + testes; **gatilho automático** pela 1ª decisão de triagem = Fatia 5.

## Portões de qualidade (saída literal)

```
===== LINT =====
> next lint
✔ No ESLint warnings or errors

===== TYPECHECK =====
> tsc --noEmit
(sem saída — limpo)

===== TEST (unit + integration) =====
 Test Files  14 passed (14)
      Tests  38 passed (38)

===== E2E (Playwright, production build) =====
Running 4 tests using 1 worker
  ✓ auth.spec.ts — cadastro autentica e leva à lista de Revisões
  ✓ auth.spec.ts — rota protegida sem sessão redireciona ao login
  ✓ review-switch.spec.ts — cria duas Revisões e troca a ativa pelo seletor
  ✓ smoke.spec.ts — home renderiza o nome do produto
  4 passed (43.7s)
```

Cobertura nova de integração nesta fatia: `byok.test.ts` (Vault round-trip +
decifragem só por `service_role`) e `rls.question-protocol.test.ts` (isolamento
por Revisão — SC-009). `protocol-lock.test.ts` cobre imutabilidade + emenda (SC-010).

## Diferido explicitamente para fatias seguintes

- **Gatilho automático de lock** pela 1ª `screening_decision` → **Fatia 5**.
- **Export PDF** do protocolo/relatório → **Marco 3**.
- **Jobs assíncronos / pré-classificação em lote** (worker, fila, UI de custo) → **Fatia 3 / Fatia 5**.
- **Consumo de `estimateCost` na UI da fila** → **Fatia 5** (a base já existe).

## CHECKPOINT 3 — aguardando merge manual

Conforme `CLAUDE.md` §5: a sessão **não** faz merge/push. O desenvolvedor revisa o
diff do branch `build/001-marco1-nucleo-fluxo/2-pergunta-protocolo` e faz o merge
manualmente antes de qualquer próxima fatia.
