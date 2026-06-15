# COMPLETION — Fatia 3: Relatório estruturado (US3)

**Feature**: `003-marco3-saida-sintese-relatorio` (Marco 3 — Saída)
**Branch**: `build/003-marco3-saida-sintese-relatorio/3-report` (a partir de `85b32a5`, feature HEAD)
**Data**: 2026-06-14
**Status**: ✅ Build completo, **aguardando merge manual do desenvolvedor (CHECKPOINT 3)**. A sessão **não** fez merge/push.

---

## O que foi entregue (US3 — FR-012..017, FR-024; SC-003, SC-004, SC-009 declaração)

Relatório estruturado da Revisão, montado deterministicamente do estado real, com trilha
assistida por IA editável e regeneração que preserva edições humanas.

- **Migration `0019_report.sql`**: tabelas `report` (1:1 review) e `report_section`
  (`kind`, `content`, `edit_state`, `ai_suggestion_id`, `"order"`, UNIQUE(report_id,kind));
  enums `report_section_kind` / `report_section_edit_state`; `ALTER TYPE ai_target_kind ADD
  'report_section'` + `ALTER TYPE job_type ADD 'report_draft'` (aditivos); RLS
  `is_review_member`; RPCs `create_report_draft_job` (só enfileira, 2 itens: discussion+
  conclusion; guarda contra job duplicado) e `set_report_section_content` (edição auditada;
  rejeita Resultados/decl-IA/desvios — A3 + factuais).
- **`LLMProvider.draftReportSection`** (mock + anthropic) + `estimateCost('report_draft')` +
  `estimateReportDraftCost`. Discussão/Conclusão rascunhadas como ponto de partida editável
  (pt-BR, provenance obrigatória).
- **Builders determinísticos puros** (`src/lib/report/sections.ts`): `buildMethodsSection`
  (pergunta/critérios/protocolo/busca/fluxo de triagem + declaração de fases opcionais OFF,
  FR-015), `buildResultsSection` (contagens + **embute a síntese ratificada de US1**, A3,
  sem novo passe de LLM; sinaliza síntese ausente sem inventar), `buildAiDeclaration`
  (enumera fases com IA + proveniência, FR-013), `buildDeviations` (emendas datadas,
  FR-014), `buildOptionalPhasesDeclaration` (FR-015), `buildDeterministicSections`.
- **IO** (`src/lib/report/queries.ts`, deps-injection): `loadReportInputs` (carrega tudo;
  temas só ratificados accepted/edited; `ai_suggestion` de **todos** os estados —
  transparência FR-013), `resolveReport` (1:1 idempotente), `loadReport`.
- **Worker Node** (`src/lib/report/{enqueue,batch-worker,batch-run}.ts`):
  `processReportDraftJob` monta as 4 determinísticas (upsert preservando `human_edited`) e
  rascunha as 2 seções IA resilientemente por-item (preserva `human_edited`; grava
  `ai_suggestion` target_kind=`report_section` + `ai_usage` phase=`report`); espelha o
  worker de síntese; outer try/catch marca job/report `failed` em erro fatal.
- **Regeneração + server actions** (`regenerate.ts` + `app/reviews/[reviewId]/report/
  actions.ts`): `regenerateDeterministicSections` (sem LLM, preserva `human_edited`,
  reporta `{regenerated, preserved}` — FR-016); `estimateReport`/`generateReport`
  (enfileira com client do membro, worker com admin) / `regenerateReport` / `editReportSection`.
- **Trilho de fases**: fase `report` (locked até `synthesisReady`, done quando
  `report.status='ready'`).
- **UI**: `app/reviews/[reviewId]/report/page.tsx` + `src/components/report/*`
  (`SectionEditor` — editável só em Métodos/Discussão/Conclusão; `ReportRunner`;
  `RegenerateButton`), **embute o `PrismaFlowchart` da Fatia 1** após Resultados; actions
  passadas por prop (alias `@/*`→`./src/*`).

## Invariante A3 (Resultados deterministic-only) — reforçada em 3 camadas
- UI: `SectionEditor` não edita `results`/`ai_declaration`/`deviations`.
- RPC: `set_report_section_content` levanta exceção para esses `kind`.
- Regeneração: sempre reescreve Resultados do estado corrente (síntese ratificada).
Editáveis → `human_edited` e preservadas na regeneração: **Métodos, Discussão, Conclusão** (FR-016).

## Verificação
- `tsc --noEmit`: ✅ limpo. `npm run lint`: ✅ 0 erros.
- Testes da fatia: `tests/integration/report.test.ts` (9) ✅, `tests/unit/report/sections.test.ts`
  (9) ✅, `tests/unit/ai/llm-contract.test.ts` (12, +2 novos) ✅, `tests/unit/shell/phases.test.ts`
  (+4 novos) ✅. Suíte unitária completa: 258/258 ✅.
- **Suíte completa em paralelo**: 425/430 — os 5 "fail" são **flakiness de contenção** no
  Postgres local compartilhado + timeout default de 5s sob carga (vários testes fazem chamadas
  reais à Anthropic de 10–20s). **Todos os 5 arquivos passam isoladamente** (synthesis 5/5;
  extraction-batch + rls.extraction-batch + rls.embedding-chunk 14/14). Nenhuma regressão —
  os arquivos que falharam não são tocados por esta fatia.
- **e2e (Playwright)**: `tests/e2e/report.spec.ts` adicionado e **passou** (1 passed, ~1.2min)
  — cobre o fluxo real "Gerar relatório" pela UI (signup→review→seed→gerar), assegura as 6
  seções + fluxograma embutido, e **guarda a regressão do client de membership** (generateReport
  enfileira com o client do membro, não admin — espelha o motivo do synthesis.spec.ts). Validação
  visual fina do UI segue a cargo do desenvolvedor.

## Fora de escopo (fatias seguintes)
- Tabela de características dos estudos + checklist PRISMA → **Fatia 4**.
- Exportação (MD/BibTeX/RIS/DOCX/PDF/APA7) → **Fatias 5/6**.

## Commits (build/003-.../3-report, sobre 85b32a5)
plano `3a4ef76` · migration `23fd050`+`bad9f7b` · LLM `f63a8aa` · builders `955bad3` ·
IO `48c60c8` · worker `4d9d254`+`93795e5` · regen/actions `ca718dd` · fase `f556e53` ·
UI `57ddfbb`+`074c936`.

## Pós-merge (a fazer pelo dev / próxima sessão)
Atualizar a tabela "Estado de execução" em [slicing.md](./slicing.md) (linha Fatia 3 →
✅ mergeada + SHA do merge), como feito para as Fatias 1 e 2. Próxima: **Fatia 4**.
