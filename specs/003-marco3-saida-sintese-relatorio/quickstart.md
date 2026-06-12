# Quickstart — Marco 3: Saída (síntese, relatório/fluxograma PRISMA, exportações)

**Feature**: `003-marco3-saida-sintese-relatorio` | **Date**: 2026-06-12

> Deltas sobre o ambiente já montado nos Marcos 1–2 (não repete o setup base). Pré-
> requisito: Marcos 1–2 mergeados em `main`, com Revisão tendo estudos `included_ft` e
> `extraction_value` validados (insumo da síntese).

## Pré-requisitos (herdados, já funcionando)

- Node + `npm install`; Supabase local (`supabase start`), migrations `0001`–`0017`
  aplicadas (`supabase db reset`).
- `.env.local` com chaves Supabase; **1ª chave BYOK** (LLM/Anthropic) cifrada no Vault.
  A síntese e o rascunho de Discussão/Conclusão usam **essa** chave (não há 3ª chave).
- Husky/lint-staged ativos (shebang corrigido no Windows — ver setup do worktree).

## Deltas deste marco

1. **Novas dependências** (instalar **só na fatia que as usa**, por tarefa explícita —
   constitution §Portões):
   - `docx` — geração DOCX (R3)
   - `pdfmake` — geração PDF pura-JS (R3)
   - `@resvg/resvg-wasm` — rasterização SVG→PNG no worker (R2)
   - `citeproc` + arquivo CSL **APA 7** — formatação de citações (R4)
2. **Migrations novas** (`0018`+): `synthesis`, `theme`, `theme_finding`, `report`,
   `report_section`, `prisma_checklist_item`, `export_artifact`; bucket `exports` +
   policy `storage.objects`; `ALTER`s aditivos (`ai_suggestion.target_kind`, `job.type`,
   `ai_usage.phase`). Rodar `supabase db reset` e **regenerar tipos**
   (`database.ts`).
3. **Edge Functions estendidas**: `jobs-enqueue` (validar + enfileirar `synthesis_batch`/
   `report_draft`/`report_export` — só enfileira, §VIII) e `jobs-worker` (handlers dos
   três novos `type`s). Seed dos 27 itens PRISMA 2020 (checklist, R5).

## Smoke test (caminho feliz — SC-005)

1. Abrir uma Revisão com estudos incluídos e extração validada → fase **Síntese**.
2. **Gerar síntese**: ver estimativa de custo → confirmar → job `synthesis_batch` →
   temas `pending` com narrativa + tabela-resumo, cada um com refs de achado (grounding).
3. Renomear/fundir um tema, editar narrativa, **aceitar** → estados refletem; trilha
   registra.
4. Fase **Redação** → **Gerar relatório**: Métodos/Resultados preenchidos dos dados;
   Discussão/Conclusão rascunhadas (pending); declaração de IA e desvios montados.
   Editar a Discussão e salvar.
5. Abrir o **fluxograma PRISMA**: conferir que os números batem com os contadores do
   shell (SC-002). Abrir **checklist** e **tabela de características**.
6. **Regenerar relatório**: confirmar que a Discussão editada foi **preservada** e a UI
   avisou (FR-016).
7. **Exportar**: DOCX + PDF + MD + BibTeX + RIS numa operação (job `report_export`) →
   baixar os artefatos do bucket `exports`. Conferir citações em APA 7.

## Verificações de qualidade (antes de apresentar qualquer fatia)

- `npm run lint` e `tsc --noEmit` limpos.
- Vitest: síntese (grounding em achado / "dados insuficientes"), montagem determinística
  de Métodos/Resultados, regeneração que preserva seções editadas, serializadores
  BibTeX/RIS/APA7, fluxograma == views PRISMA, RLS do bucket `exports`.
- Playwright (última fatia): síntese → relatório → exportação multi-formato (SC-005).
- Coverage ≥ 80% nas funções críticas (serialização/derivação) — constitution §Testes.

## Invariantes que NÃO podem regredir

- Fluxograma = **espelho** das views PRISMA, número-a-número (§VI).
- IA só via `LLMProvider`; Métodos/Resultados/declaração-IA/desvios **sem LLM** (R9).
- A IA **sugere**, o humano ratifica; nada finalizado pela IA (§I).
- RLS em todas as tabelas novas + bucket `exports` (§IV).
- Não tocar o workbench de triagem nem o código dos Marcos 1–2 (não-regressão).
