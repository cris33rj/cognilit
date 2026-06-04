# COMPLETION — Fatia 8: Motivos de exclusão derivados dos critérios

Branch: `build/001-marco1-nucleo-fluxo/8-exclusion-reasons-from-criteria`
Status: **pronta para revisão/merge manual** (CHECKPOINT 3).

## Objetivo

Conectar os critérios de exclusão ratificados (tela Pergunta/Protocolo) à lista de
motivos de exclusão usada na Triagem de Texto completo — que antes era uma lista
genérica seedada, desacoplada. Aproxima o comportamento do padrão Rayyan **sem** alterar
D7/FR-025 (T/R segue sem motivo; TC segue exigindo motivo de lista configurável). De
fato passa a *cumprir* o "lista configurável por projeto" de D7, que não tinha UI.

## O que mudou

| Item | Onde |
|------|------|
| Motivos de TC derivados dos critérios de exclusão ratificados (`kind='exclusion'`, `ratification_state in accepted/edited`), espelhados em `exclusion_reason` (`origin='criterion'`, `source_criterion_id`) | `supabase/migrations/0008_exclusion_reasons_from_criteria.sql` (`sync_exclusion_reasons_from_criteria`) |
| Lista = derivados + seeds genéricos, dedup por rótulo normalizado | `normalize_reason_label`, `ensure_exclusion_reasons`, `seed_default_exclusion_reasons` (agora idempotente por rótulo) |
| Adicionar motivo manual inline (dedup) e remover (soft-delete, preserva PRISMA) | RPCs `add_exclusion_reason`, `set_exclusion_reason_active`; actions `addExclusionReason`/`removeExclusionReason` |
| Órfão (critério des-ratificado) → desativa só se não usado; re-ratificar reativa | `sync_exclusion_reasons_from_criteria` |
| Painel "Motivos de exclusão" no modo Texto completo: lista com marcador "do critério", input de adicionar, botão remover | `src/components/workbench/ScreeningQueue.tsx`, `app/reviews/[reviewId]/workbench/page.tsx` |
| Tipos + camada de dados | `src/types/database.ts`, `src/lib/screening/queries.ts` |
| PRISMA intacto (view 0007 não tocada; resolve por id sem filtrar is_active) | `prisma_exclusion_breakdown` |

## Decisões de implementação

- **D-F8.1** — Espelhamento (mirror) dos critérios em `exclusion_reason` em vez de mexer
  no FK `record.ft_exclusion_reason_id`/view/RPCs: mantém toda a plumbing existente.
- **D-F8.2** — Toda mutação via RPC `security definer` + `audit_entry` + `is_review_member`
  (Princípio III / D-F5.1). Soft-delete (nunca DELETE) para preservar o breakdown PRISMA.
- **D-F8.3** — Dedup por rótulo normalizado (`lower`+colapso de espaços) entre seed,
  derivado e manual; dedup semântico fica fora (exige embeddings — Marco 2+).
- **D-F8.4** — Composição = derivados + seeds genéricos (rede de segurança). Órfão:
  desativar só se não usado. (Decisões de produto fechadas com o usuário.)
- **D-F8.5** — Marcador "do critério" reusa o vocabulário visual de IA (SC-005).

## Verificação (gates)

- `npm run typecheck` — limpo.
- `npm run lint` — limpo.
- `npm test` — **158 testes / 40 arquivos**, verde (inclui `tests/integration/exclusion-reasons.test.ts`, 12 testes novos).
- `npx playwright test tests/e2e/screening.spec.ts` — 3 passando (exclusão TC + add/remove inline).

## Fora de escopo (conforme plano)

- Motivo de exclusão no T/R (emenda a D7/FR-025 → Sessão A).
- Dedup semântico de motivos.
- E2E do marcador "do critério" (sem fixtures de critérios ratificados no harness e2e;
  coberto em unit + integração). Limitação consciente.
