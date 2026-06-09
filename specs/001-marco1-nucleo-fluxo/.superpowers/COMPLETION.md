# Feature complete: marco1-nucleo-fluxo

> **Consolidado retrospectivo.** Síntese das 15 fatias (+ 1 sub-fatia) do
> Marco 1, escrita após o merge da feature em `main`. Fonte: `slicing.md`
> (§"Estado das fatias"), os `COMPLETION-fatia-*.md` por fatia, e os merges
> reais do histórico git. Os números de verificação refletem o estado do
> **HEAD do Marco 1** (`70f76c5`), conforme registrado na verificação da
> Fatia 15 (última fatia) — não uma re-execução independente nesta sessão.
>
> Este é o arquivo que a Sessão A do **Marco 2** cita na seção
> "Estado dos marcos anteriores" do seu `HANDOFF.md`.

## Summary

Marco 1 entregou o **esqueleto andante** do Cognilit: um pesquisador solo cria
uma Revisão isolada (auth + RLS) → formula a Pergunta (SPIDER) → rascunha/trava
o Protocolo PRISMA-P → importa referências (RIS/BibTeX/CSV) e registra a busca →
deduplica (exatas auto + fila fuzzy) → tria em duas etapas (título/resumo →
texto completo) com IA-no-laço, **tudo numa bancada de triagem unificada por
modos** (Princípio V / D32), com trilho de fases e contadores PRISMA vivos e
trilha de auditoria exportável. Planejado em 6 fatias; cresceu para **15 fatias
+ 1 sub-fatia** ao incorporar polish de design, correções de semântica PRISMA e
refinamentos de UX (detalhe abaixo). Não inclui ingestão/extração de PDF por IA
(Marco 2) nem síntese/relatório/exportações (Marco 3).

## Fatias

(Da `slicing.md` + merges reais. FF = fast-forward, sem commit de merge.)

- Fatia 1 — Fundação & Revisão isolada — branch `build/001-marco1-nucleo-fluxo/1-fundacao-revisao` — mergeada (FF, tip `a4b4e4b`)
- Fatia 2 — Pergunta + Protocolo (+ plumbing IA/BYOK) — branch `…/2-pergunta-protocolo` — merge `181e184`
- Fatia 3 — Workbench shell + Importação & registro de busca — branch `…/3-workbench-importacao` — mergeada (FF, commit `114da4f` / tip `a70b8cd`)
- Fatia 4 — Deduplicação no workbench — branch `…/4-deduplicacao` — merge `82dcab5`
- Fatia 5 — Triagem em duas etapas + IA-no-laço — branch `…/5-triagem` — merge `a68914d`
- Fatia 6 — Shell, trilho & PRISMA vivo + export de auditoria — branch `…/6-shell-prisma-auditoria` — merge `9de6a0a`
- Fatia 7 — Design System + Polish Visual — branch `…/7-design-system-polish` — merge `bc962a8`
- Fatia 8 — Motivos de exclusão derivados dos critérios — branch `…/8-exclusion-reasons-from-criteria` — merge `8a55408` (+ docs-sync `b58c32a`)
- Fatia 8-1 — Remoção segura de motivo de exclusão em uso — branch `…/8-1-block-in-use-reason-removal` — merge `92c4421`
- Fatia 9 — Correção da semântica PRISMA (fluxo cumulativo) — branch `…/9-prisma-flow-semantics` — merge `c9c4e64`
- Fatia 10 — Indicador de processamento nos gatilhos síncronos de IA — branch `…/10-ai-pending-feedback` — merge `468f878`
- Fatia 11 — Re-derivação segura de critérios (idempotência + guarda de fase) — branch `…/11-criteria-rederivation-guard` — merge `14aa0dc`
- Fatia 12 — Visualização do markdown no editor de Protocolo — branch `…/12-protocol-markdown-preview` — merge `21192d3`
- Fatia 13 — Polish do modo Importar — branch `…/13-import-mode-polish` — merge `dc7c84f`
- Fatia 14 — Histórico de buscas importadas — branch `…/14-import-history-list` — merge `6d9c355`
- Fatia 15 — Painel de detalhe do registro na triagem T/R — branch `…/15-record-detail-panel` — merge `70f76c5` (HEAD do Marco 1)

## Deviations from IMPLEMENTATION_PLAN.md

- **Escopo cresceu de 6 → 15 fatias (+ 8-1).** As fatias 7–15 foram adendos
  ratificados durante a Sessão B (registrados nos cabeçalhos de adendo do
  `slicing.md`): design system/polish (F7), motivos de exclusão derivados dos
  critérios (F8) e sua correção de remoção-em-uso (F8-1), semântica PRISMA
  cumulativa (F9), feedback de processamento de IA (F10), guarda de re-derivação
  de critérios (F11), preview de markdown do protocolo (F12), polish de
  importação (F13), histórico de buscas (F14) e painel de detalhe na triagem
  (F15). Nenhum adendo adicionou FR novo nem reabriu decisão D/princípio — todos
  são aprofundamento ou correção dentro do spec.md sign-off.
- **Itens A\* do HANDOFF resolvidos no build (não reabrir):** A1 (formato de
  export da trilha), A2 (orçamento de performance da fila — limiar e2e em
  `screening-perf`), A3 (libs de parsing RIS/CSV/BibTeX + TanStack Virtual, por
  tarefa explícita).

## Follow-up suggested (from CONTEXT.md deferred list)

- **Marco 2 — coração AI-first** (próximo): ingestão de PDF (D10/D31) + extração
  por IA com grounding/proveniência (D11–D13, D22) + validação humana; RAG/busca
  semântica (D27/D28) reaproveitando o pipeline de texto.
- Diferidos da v1 (CONTEXT §6/§8): integração via API com bases; colaboração
  multi-revisor operacional (kappa/conflitos — modelada no schema, latente);
  visualizador PDF lado-a-lado; meta-análise/GRADE quantitativo.

## Verification report

(Estado do HEAD `70f76c5`, conforme a verificação registrada na Fatia 15.)

- **Unit + integração (Vitest):** 232 passed / 55 files (3 skipped). Os skips são
  pré-existentes da Fatia 2 (protocol-draft, question-derivation).
- **E2E (Playwright):** 15 passed — inclui o gate de triagem da Fatia 5
  (`screening-perf` com ~5.000 registros / DOM virtualizado < 200 linhas;
  `screening-a11y` / SC-013) preservado.
- **Lint (`next lint`):** limpo — "No ESLint warnings or errors".
- **Type-check (`tsc --noEmit`):** limpo.
- **Cobertura:** funções críticas de dedup, triagem e parsing cobertas por unit +
  integração (constitution §Testes, alvo 80%).
- **Observação (flake conhecido, não-bloqueante):** em execução paralela,
  `tests/integration/dedup.test.ts` pode falhar por compartilhamento do Supabase
  local ("Multiple GoTrueClient instances"); passa 9/9 em isolamento e a
  re-execução completa fica verde (232/232).
- **Merges:** feitos pelo desenvolvedor após revisão de cada fatia (a Sessão B
  nunca mergeou); 15 fatias + 1 sub-fatia mergeadas na feature, e a feature
  mergeada em `main` (HEAD `70f76c5`).

## Ready for review: YES
