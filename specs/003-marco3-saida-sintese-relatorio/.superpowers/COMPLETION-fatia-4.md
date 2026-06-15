# COMPLETION — Fatia 4: Checklist PRISMA 2020 + Tabela de características (US4)

**Feature**: `003-marco3-saida-sintese-relatorio` (Marco 3 — Saída)
**Branch**: `build/003-marco3-saida-sintese-relatorio/4-checklist-characteristics` (a partir de `1290f65`, feature HEAD)
**Data**: 2026-06-15
**Status**: ✅ Build completo, **aguardando merge manual do desenvolvedor (CHECKPOINT 3)**. A sessão **não** fez merge/push.

---

## O que foi entregue (US4 — FR-018, FR-019, FR-025; SC-009 parte checklist)

Dois artefatos de conformidade do relatório, montados **deterministicamente** (sem LLM) do
estado real da Revisão, em pt-BR:

- **Checklist PRISMA 2020 auto-preenchido** (FR-018): os **27 itens** marcados
  `met | pending | not_applicable`, com referência à seção que cobre cada item; gravado
  como **snapshot por Revisão** na geração/regeneração do relatório.
- **Tabela de características dos estudos** (FR-019): 1 linha por estudo `included_ft`,
  colunas = campos do formulário de extração; **derivação pura** de
  `extraction_value × extraction_field` (sem tabela nova).

### Detalhe técnico

- **Migration `0020_prisma_checklist.sql`**: enum `prisma_checklist_status`
  (`met|pending|not_applicable`); tabela `prisma_checklist_item` (snapshot por Revisão,
  `UNIQUE(review_id,item_code)` p/ upsert idempotente); RLS `is_review_member` (`for all`).
  Puramente aditiva (nenhum `ALTER` em objeto existente). Sem índice extra em `review_id`
  (o índice implícito do `UNIQUE` já cobre — coluna líder).
- **Seed estático `src/lib/prisma/checklist-items.ts`**: `PRISMA_2020_ITEMS` (27 itens,
  rótulos pt-BR) + `CoverageRule` (vocabulário fechado: `section` | `study_selection` |
  `characteristics` | `optional_off` | `manual`). O seed é **constante TS** (R5:
  "seed estático em `src/lib/prisma/`"), não dados SQL — a migration só cria a tabela.
- **Engine `src/lib/prisma/checklist.ts`**: `deriveChecklist` (**pura**, mapeia regra→status)
  + IO `computePrismaChecklist` (lê `report_section`/`prisma_counter`/`extraction_value`),
  `snapshotPrismaChecklist` (upsert `onConflict: review_id,item_code`), `loadPrismaChecklist`
  (leitura ordenada p/ UI). Convenção deps-injection `{ supabase }`.
- **Características `src/lib/prisma/characteristics.ts`**: `assembleCharacteristics` (**pura**)
  + `buildCharacteristicsTable` (IO; reusa `listExtractionFields`/`listStudies` do Marco 2,
  lê `extraction_value` `state in (accepted,edited)`). Coluna "Estudo" + campos; célula =
  `final_value` ratificado ou `null`.
- **Integração (aditiva) na Fatia 3**: `snapshotPrismaChecklist` é chamado ao fim de
  `processReportDraftJob` (worker, client admin — antes de `report.status='ready'`) **e** de
  `regenerateDeterministicSections` (server action, client do membro — autorizado pela RLS).
  +3 linhas em `batch-worker.ts`, +4 em `regenerate.ts`; nada mais alterado.
- **UI**: `PrismaChecklistPanel` + `CharacteristicsTablePanel` (Server Components read-only)
  renderizados após as seções em `app/reviews/[reviewId]/report/page.tsx`, sob `{report && …}`.

## Mapa de cobertura dos 27 itens (decisão de design — revisável)

`met` para itens cobertos por Métodos/Resultados/Discussão/seleção(contadores)/características;
`not_applicable` para Viés (11,14,18,21) e Certeza (15,22) — fases OFF (D19/§VI/SC-009);
`pending` para itens que a v1 não gera (1,2,3 Título/Resumo/Justificativa; 12 Medidas de
efeito; 25 Financiamento; 26 Conflitos; 27 Disponibilidade) — caso US4.3. O mapa exato vive
em `PRISMA_2020_ITEMS` e é trivial de reajustar item a item; a engine é agnóstica ao mapa.

## Verificação

- `npx tsc --noEmit`: ✅ 0 erros. `npm run lint` (next lint): ✅ 0 warnings/erros.
- Unit: `tests/unit/prisma/checklist.test.ts` (5) ✅, `tests/unit/prisma/characteristics.test.ts`
  (3) ✅. **Suíte unitária completa: 266/266 ✅** (60 arquivos; baseline 258 + 8 novos).
- Integração: `tests/integration/prisma-checklist.test.ts` (3) ✅ — (a) geração grava 27 itens
  com estados corretos; (b) regeneração re-grava idempotente (continua 27); (c) RLS bloqueia
  não-membro. Não-regressão: `tests/integration/report.test.ts` (9) ✅ → **12/12** no conjunto.
- `npx next build`: ✅ compila (19 rotas; rota `report` ok).
- Revisão por subagente: cada task passou spec-compliance + code-quality; revisão holística
  final = **Ready to merge** (sem issues Critical/Important).

## Observações de revisão (Minor — não corrigidas, documentadas)

1. **`hasCharacteristics` não re-checa `record.corpus_state`**: lê `extraction_value`
   ratificados por `review_id` sem juntar a `record`. Na v1 não há divergência — a extração é
   gated a `included_ft` (RPC `create_extraction_job`, 0016), então só estudos incluídos têm
   valores ratificados. Hardening futuro: juntar a `record.corpus_state='included_ft'` no
   sinal `hasCharacteristics` para blindar contra dados anômalos.
2. **Prefetch incondicional**: a página carrega checklist+características no `Promise.all`
   mesmo sem relatório (resultados vazios, painéis só sob `{report && …}`). Mesma convenção do
   `loadPrismaFlowModel` existente — nit de performance, sem bug.
3. **Cores `emerald/amber` no badge de status**: Tailwind cru (sem token semântico do tema) —
   alinhar quando o design system ganhar tokens de status.

## Fora de escopo (fatias seguintes)

- Exportação (embutir checklist + tabela de características em MD/DOCX/PDF) → **Fatias 5/6**.

## Commits (build/003-.../4-checklist-characteristics, sobre `1290f65`)
plano+tracking `337ca20` · migration `f35f6f2` · seed `2b6d61b` · engine checklist `9c3c477` ·
characteristics `0b99b96` · hooks snapshot `07fc8e7` · UI `7a2274b` · integração `89fccd6`.

## Pós-merge (a fazer pelo dev / próxima sessão)
Atualizar a tabela "Estado de execução" em [slicing.md](./slicing.md) (linha Fatia 4 →
✅ mergeada + SHA do merge), como nas Fatias 1–3. Próxima: **Fatia 5** (Export infra +
MD/BibTeX/RIS, US5a).
