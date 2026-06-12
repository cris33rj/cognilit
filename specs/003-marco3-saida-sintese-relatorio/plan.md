# Implementation Plan: Marco 3 — Saída (síntese, relatório/fluxograma PRISMA, exportações)

**Branch**: `003-marco3-saida-sintese-relatorio` | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-marco3-saida-sintese-relatorio/spec.md`

## Summary

Sobre o esqueleto andante dos Marcos 1–2 (já mergeados em `main`), o Marco 3 fecha
a v1 entregando a **Saída**: transforma os **dados de extração já validados** (Marco 2)
num **produto entregável**. Cinco capacidades: (1) **síntese qualitativa assistida** —
um agente LLM agrupa os achados em **temas**, rascunha narrativa por tema e tabelas-
resumo, com **grounding em nível de achado** (cada afirmação referencia o
`extraction_value` de origem) e validação humana (aceitar/editar/rejeitar); (2)
**fluxograma PRISMA 2020** auto-derivado — o **espelho** das views `prisma_counter` /
`prisma_exclusion_breakdown` que já são a fonte única dos contadores (Princípio VI),
renderizado read-only e exportável em SVG/PNG; (3) **relatório estruturado** — Métodos/
Resultados **determinísticos e fiéis aos dados** (montados sem LLM a partir de dados já
ratificados), Discussão/Conclusão **rascunhadas por IA como ponto de partida editável**,
mais **declaração de IA** e **desvios do protocolo** montados deterministicamente das
tabelas existentes; (4) **checklist PRISMA** auto-preenchido + **tabela de
características** (derivada de `extraction_value`); (5) **exportações** DOCX/PDF/MD +
referências BibTeX/RIS com citação **APA 7**, como **job assíncrono** resiliente.

Abordagem técnica (derivada da [research.md](./research.md), dentro da stack ratificada
e **ancorada no código real dos Marcos 1–2**): estende o `LLMProvider`
(`src/lib/ai/llm/`) com `synthesizeThemes`/`draftNarrative`/`draftReportSection`/
`estimateCost`; reutiliza a infra `job`/`job_item` + `jobs-enqueue` + `jobs-worker`
(`pg_cron`) adicionando os `type`s `synthesis_batch`, `report_draft` e `report_export`;
**consome as views PRISMA existentes** (`0007`) para o fluxograma — sem recontar; e
adiciona um bucket de Storage para os artefatos exportados. Migrations novas a partir de
`0018` (tabelas `synthesis`/`theme`/`theme_finding`/`report`/`report_section`/
`prisma_checklist_item`/`export_artifact`, Storage policy do bucket de export, e
`ALTER`s **aditivos** aos enums `ai_suggestion.target_kind`, `job.type`,
`ai_usage.phase`). Os documentos pesados (DOCX/PDF, rasterização PNG) são gerados por
**bibliotecas puras-JS Deno-compatíveis** no worker (sem chromium/binário externo).

## Technical Context

**Language/Version**: TypeScript (strict) — Next.js 14+ (App Router), React 18+.
Edge Functions em Deno/TypeScript (runtime Supabase), reusando `jobs-enqueue`/
`jobs-worker` existentes.

**Primary Dependencies** (existentes, reusadas): `@anthropic-ai/sdk` (LLM — síntese e
rascunho de seções), `@supabase/supabase-js` + `@supabase/ssr`, TanStack Query/Table,
React Hook Form + Zod, `react-markdown`/`remark-gfm` (preview de relatório). **Novas,
adicionadas por tarefa explícita por fatia** (constitution §Portões): geração **DOCX**
(`docx` — R3), geração **PDF** pura-JS (`pdfmake` — R3), rasterização **SVG→PNG**
(`@resvg/resvg-wasm` — R2), formatação de citação **APA 7** (`citeproc` + CSL APA — R4).
BibTeX/RIS são **serializadores próprios** testados (R4), reusando os metadados já
importados no Marco 1 (sem nova lib de geração).

**Storage**: Supabase Postgres (RLS desde a origem; tabelas novas do marco), **Supabase
Storage** (novo bucket privado `exports` para os artefatos gerados, policy por
`review_id` no path — R8). Reusa as views PRISMA (`prisma_counter`,
`prisma_exclusion_breakdown` — `0007`) e `pg_cron` (worker herdado).

**Testing**: Vitest (unit/integração: síntese com grounding em achado, montagem
determinística de Métodos/Resultados, regeneração que preserva seções editadas,
serializadores BibTeX/RIS, derivação do fluxograma a partir das views, RLS do bucket de
export), Playwright (e2e: síntese → relatório → exportação multi-formato — SC-005).
Mocks de `LLMProvider` (sem rede).

**Target Platform**: Web (deploy Vercel; Supabase como BaaS). Worker em Edge Function
agendada (Deno).

**Project Type**: Web application (single-app, não monorepo) — frontend + BaaS.

**Performance Goals**: síntese, rascunho de seções de IA e exportação processam o corpus
de estudos incluídos de uma Revisão **de forma assíncrona**, retomável e resiliente
por-item, sem bloquear a UI (D25/§VIII). O **fluxograma in-app** é renderizado de forma
síncrona e leve (SVG a partir das views); só a **rasterização PNG e o empacotamento dos
documentos** são trabalho de worker.

**Constraints**: RLS obrigatória em todas as tabelas novas e no bucket de export; **a
Edge Function nunca renderiza documento pesado** (valida/persiste/enfileira → worker
gera DOCX/PDF/PNG, §VIII); IA só via `LLMProvider` (sem SDK direto, sem raw write, §VII);
**Métodos/Resultados são determinísticos** (montados de dados já ratificados, sem nova
autonomia de IA — §I/§II); síntese e Discussão/Conclusão são **sugestões** com estado
`pending/.../rejected` e grounding/proveniência obrigatórios; "dados insuficientes" é
resposta de 1ª classe (§II/FR-007); a IA **nunca finaliza** uma seção/tema (§I); saída
pt-BR com trecho-fonte no original (D24); **fluxograma = espelho** dos contadores
(número-a-número, §VI); APA 7 é o único estilo (sem outros CSL); trilha append-only; sem
`any`.

**Scale/Scope**: pesquisador solo (v1). Corpus de estudos incluídos por Revisão (dezenas
a baixas centenas). 5 user stories (P1×2, P2×2, P3×1), 28 FR (FR-001..026 + FR-005a/011a),
9 SC.

**Decisões deixadas ao /plan e agora resolvidas** (ver [research.md](./research.md)):
R1 síntese = job que agrupa achados validados em temas via `LLMProvider`, grounding em
`extraction_value` (Q3); R2 fluxograma SVG por template determinístico das views PRISMA +
PNG via `@resvg/resvg-wasm` no worker; R3 DOCX via `docx`, PDF via `pdfmake` (puro-JS,
Deno), MD por montagem direta — tudo no `report_export` job, validar contra saída real;
R4 APA 7 via `citeproc`+CSL, BibTeX/RIS por serializador próprio; R5 checklist PRISMA
2020 (27 itens) seed + cobertura computada; R6 tabela de características = derivação de
`extraction_value` (sem tabela nova); R7 regeneração preserva seções `human_edited`
(Q1); R8 bucket `exports` com RLS por path; R9 Métodos/Resultados/declaração-IA/desvios
**determinísticos** (sem LLM) — só síntese e Discussão/Conclusão consomem o
`LLMProvider`, com `estimateCost`/`ai_usage` (phases `synthesis`/`report`).

**Relação com Marcos 1–2 (não-regressão)**: o Marco 3 **estende** entidades/contratos
existentes (`ai_suggestion`, `job`, `ai_usage`, `LLMProvider`, views PRISMA) e **não
refatora** código dos Marcos 1–2 exceto onde uma tarefa o exigir explicitamente. O
fluxograma **consome** `prisma_counter`/`prisma_exclusion_breakdown` (não recalcula). A
tabela de características **lê** `extraction_value` (não reabre a engine de extração). O
vocabulário visual de IA (suggestion chip, provenance popover, accept/edit/reject) é
**reusado** para temas e seções do relatório (EP-3). As fases opcionais (Risco de Viés,
Certeza) **permanecem desligadas** — o relatório apenas **declara** sua ausência (D19).

## Constitution Check

*GATE: avaliado antes da Fase 0 e re-avaliado após a Fase 1 (Design).*

| # | Princípio | Como o plano cumpre | Status |
|---|-----------|---------------------|--------|
| I | Humano-no-laço + gradiente | Temas e seções IA (Discussão/Conclusão) **só sugerem** (`state` pending/…/rejected); a IA nunca finaliza (FR-003/FR-016). Métodos/Resultados são **montagem determinística de dados já ratificados** — não nova autonomia. | ✅ |
| II | Grounding + proveniência | Narrativa de tema ancora em `extraction_value` específico (Q3/FR-002); seções IA carregam proveniência; "dados insuficientes" 1ª classe (FR-007); declaração de IA auto-gerada (FR-013). | ✅ |
| III | Auditabilidade/reprodutibilidade | Gerar/editar síntese e relatório → `audit_entry` (insert-only); regeneração **preserva** seções `human_edited`, sem sobrescrita silenciosa (FR-016/Q1). | ✅ |
| IV | Isolamento + RLS desde a origem | RLS em todas as tabelas novas; bucket `exports` com policy por `review_id` no path; toda query escopada por Revisão (FR-025). | ✅ |
| V | Triagem unificada (workbench) | O Marco 3 **não toca** o workbench de triagem. Síntese e Redação são **fases distintas** do núcleo fixo (D19), alcançadas pelo trilho de fases — sem refragmentar nada. | ✅ (n/a) |
| VI | PRISMA vivo | O fluxograma é o **espelho** das views `prisma_counter`/`prisma_exclusion_breakdown` (fonte única, `0007`): consistência número-a-número **por construção**; read-only, auto-derivado (FR-008/FR-011a/Q4). | ✅ |
| VII | IA atrás de abstração + BYOK | Síntese e rascunho via `LLMProvider` (estendido) como ponto único; `estimateCost` antes do lote (FR-006); `ai_usage` phases `synthesis`/`report`; vocabulário visual de IA **reusado**. | ✅ |
| VIII | Trabalho pesado = job assíncrono | `synthesis_batch`/`report_draft`/`report_export` como jobs; Edge **só enfileira**; worker `pg_cron` por-item, retomável, resiliente a falha por-item/por-formato (FR-005/FR-023). | ✅ |

**Restrições adicionais**: stack respeitada (novas libs — `docx`, `pdfmake`,
`@resvg/resvg-wasm`, `citeproc` — só **por tarefa explícita** por fatia); idioma pt-BR na
UI/saídas + trecho-fonte no original; `DATE` no banco; pipeline configurável (Viés/
Certeza desligadas — o relatório **declara** a ausência, não as implementa); APA 7 único.

**Resultado do gate (inicial)**: PASS — nenhuma violação. Complexity Tracking vazio.

**Re-avaliação pós-Design (Fase 1)**: o data-model e os contracts mantêm os 8 princípios
(RLS em todas as tabelas novas + bucket export; `LLMProvider` como ponto único; jobs
por-item retomáveis; síntese/seções-IA só sugerem; fluxograma espelha as views; Métodos/
Resultados determinísticos). Os `ALTER`s a enums dos Marcos 1–2 são **aditivos** (sem
remoção/refator). **PASS — sem novas violações.**

## Project Structure

### Documentation (this feature)

```text
specs/003-marco3-saida-sintese-relatorio/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0 — decisões R1..R9
├── data-model.md        # Fase 1 — entidades novas + ALTERs, RLS, máquinas de estado
├── quickstart.md        # Fase 1 — setup (deltas) + smoke test
├── contracts/           # Fase 1 — interfaces expostas
│   ├── synthesis.md         # LLMProvider estendido (synthesizeThemes/draftNarrative) + grounding
│   ├── report.md            # geração/regeneração do relatório + declaração de IA + desvios
│   └── prisma-export.md     # fluxograma (views→SVG/PNG) + checklist + características + jobs de export
├── spec.md              # Spec clarificada (Sessão A)
├── checklists/
│   └── requirements.md
└── HANDOFF.md           # (a escrever — contrato p/ Sessão B)
```

### Source Code (repository root) — extensão do código existente

Layout-alvo do Marco 3 sobre a estrutura **já existente** dos Marcos 1–2 (novos caminhos
marcados `[novo]`; o resto é estendido; Marcos 1–2 **NÃO refatorar**):

```text
app/reviews/[reviewId]/
├── synthesis/             [novo] fase Síntese (trilho de fases, D19)
│   └── page.tsx           #  temas + narrativa + tabelas-resumo + validação humana
├── report/               [novo] fase Redação (relatório + checklist + características + export)
│   └── page.tsx           #  seções editáveis, fluxograma, declaração de IA, desvios, painel de export
└── (workbench/, extraction/, search/, question/, protocol/, audit/  — Marcos 1–2, NÃO refatorar)

src/
├── components/
│   ├── ai/                # vocabulário visual de IA dos Marcos 1–2 — REUSADO (EP-3)
│   ├── synthesis/         [novo] lista de temas, editor de narrativa, tabela-resumo, refs de grounding
│   ├── report/           [novo] editor de seção, declaração de IA, desvios, tabela de características, painel de export
│   └── prisma/           [novo] renderer SVG do fluxograma + checklist PRISMA
├── hooks/                 # use*.ts — useSynthesis, useReport, usePrismaFlow, useExport [novos]
├── lib/
│   ├── ai/llm/           # LLMProvider — ESTENDER (synthesizeThemes/draftNarrative/draftReportSection/estimateCost)
│   ├── synthesis/        [novo] orquestração de clustering, mapeamento tema→achado (grounding)
│   ├── report/           [novo] montagem determinística (métodos/resultados/declaração-IA/desvios), regeneração que preserva seções
│   ├── prisma/           # queries.ts — ESTENDER: modelo do fluxograma a partir das views + checklist + características; + builder SVG
│   ├── export/           [novo] serializadores docx, pdf (pdfmake), md, bibtex, ris + APA 7 (citeproc/CSL)
│   └── jobs/             # queries.ts — ESTENDER novos type/payloads
└── types/                 # tipos compartilhados (database.ts regenerado)

supabase/
├── migrations/           # 0018+: synthesis/theme/theme_finding/report/report_section/prisma_checklist_item/export_artifact, bucket exports + policy, ALTERs aditivos
└── functions/
    ├── jobs-enqueue/     # ESTENDER: validar + novos type (só enfileira, §VIII)
    └── jobs-worker/      # ESTENDER: handlers synthesis_batch/report_draft/report_export

tests/
├── unit/                 # síntese (grounding em achado/dados insuficientes), montagem determinística, serializadores BibTeX/RIS/APA7
├── integration/          # regeneração preserva seções editadas, fluxograma = views, RLS do bucket export
└── e2e/                  # síntese → relatório → exportação multi-formato (SC-005)
```

**Structure Decision**: aplicação web single-app Next.js App Router com Supabase como
BaaS — a mesma dos Marcos 1–2, **estendida**. Escolhas-chave: (1) Síntese e Redação são
**fases distintas** do núcleo fixo (`app/reviews/[reviewId]/synthesis|report/`),
alcançadas pelo trilho de fases — **não tocam o workbench de triagem** (Princípio V
preservado); (2) o fluxograma **consome as views PRISMA existentes** como fonte única,
garantindo consistência número-a-número (Princípio VI) sem recontagem; (3) Métodos/
Resultados/declaração-IA/desvios são **montagem determinística** de dados já ratificados
(fidelidade factual, §II), e **só** síntese e Discussão/Conclusão passam pelo
`LLMProvider` (§VII); (4) todo documento pesado nos **jobs existentes** estendidos, com a
Edge só enfileirando (§VIII). Server Components por padrão; `'use client'` nas
superfícies interativas (editor de narrativa, editor de seção, painel de export).

## Complexity Tracking

> Constitution Check passou sem violações nos dois gates. **Nenhuma exceção a
> justificar.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (nenhuma) | — | — |

## Perímetro de fatiação (insumo para o HANDOFF.md → Sessão B)

A fatiação é decidida pelo `brainstorming` da Sessão B, mas respeita:
- **Migration + RLS primeiro** (Princípio IV): tabelas novas, bucket `exports` + policy e
  os `ALTER`s aditivos de enum precedem o código que os consome.
- **Não-regressão dos Marcos 1–2** (Princípio V + diretiva de não-regressão): nenhuma
  fatia refatora o workbench/triagem, a extração ou as views PRISMA herdadas, exceto onde
  uma tarefa o exigir explicitamente e com justificativa. Os `ALTER`s a enums são
  **aditivos**.
- **Dependências naturais**: síntese (US1) precede o relatório (US3, que a consome); o
  fluxograma (US2) é independente da síntese (só depende das views PRISMA, podendo vir
  cedo); checklist/características (US4) dependem do relatório/extração; a exportação (US5)
  depende de todos os artefatos existirem → vem por último.
- **Fronteira de IA**: Métodos/Resultados/declaração-IA/desvios são determinísticos (sem
  LLM); só a síntese e a Discussão/Conclusão consomem o `LLMProvider` — fatiar de modo a
  isolar o custo/risco de IA.
- Cada fatia entregável e testável ponta-a-ponta (lint + tsc + testes verdes).
- União das fatias cobre as 5 user stories; sem sobreposição.
- Dependência de schema do [data-model.md](./data-model.md) ordena as fatias.
- Novas dependências (`docx`, `pdfmake`, `@resvg/resvg-wasm`, `citeproc`) **só com tarefa
  explícita**.

## Phase 2 (planejamento) — próximos passos

Este comando termina aqui (não gera `tasks.md`). Conforme `PROTOCOLS.md`:
1. Rodar `/speckit.analyze` (próximo) e resolver qualquer divergência **antes** do
   `HANDOFF.md`.
2. Escrever `HANDOFF.md` (com `## Estado dos marcos anteriores`, diretiva de
   não-regressão, mapeamento como 1º passo, perímetro de fatiação, e reafirmação das três
   decisões de arquitetura — `PROTOCOLS.md` §"Marcos subsequentes") e confirmar o ponteiro
   `<!-- SPECKIT -->` (atualizado neste comando).
3. Sessão B: mapear base de código → `brainstorming` (fatiação) → por fatia
   `writing-plans` → `subagent-driven-development`. **`/speckit.tasks` NÃO roda nesta
   sessão.**
