# Implementation Plan: Marco 1 — Núcleo do Fluxo

**Branch**: `001-marco1-nucleo-fluxo` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-marco1-nucleo-fluxo/spec.md`

## Summary

Fatia vertical fina ponta-a-ponta do Cognilit: um pesquisador solo cria uma
Revisão isolada (auth + RLS), formula a pergunta (SPIDER) com derivação assistida
por IA, rascunha e **trava** o protocolo PRISMA-P, registra buscas e importa
referências (RIS/BibTeX/CSV), deduplica (exatas automáticas + fila fuzzy) e tria
em duas etapas — **tudo numa bancada de triagem unificada por modos** (Princípio
V / D32). A IA sugere e o humano ratifica; toda saída de IA carrega proveniência e
estado; toda mudança de estado é auditável; os contadores PRISMA são estado vivo.

Abordagem técnica (derivada da [research.md](./research.md), dentro da stack
ratificada): Next.js 14 App Router + Supabase (Auth e-mail/senha, Postgres com RLS
desde a 1ª migration, Vault para BYOK, Edge Functions). Trabalho pesado (parsing
de importação grande; pré-classificação de IA em lote) roda como **job assíncrono**
(`job`/`job_item` + worker Edge Function via `pg_cron`, observado por polling).
Fila densa virtualizada (TanStack Table + Virtual) com updates otimistas para
~5.000 registros. LLM atrás da abstração `LLMProvider` (Claude default).

## Technical Context

**Language/Version**: TypeScript (strict) — Next.js 14+ (App Router), React 18+.
Edge Functions em Deno/TypeScript (runtime Supabase).

**Primary Dependencies**: Next.js, React, Tailwind CSS 4, TanStack Table + TanStack
Query (+ TanStack Virtual — nova, via tarefa explícita), React Hook Form + Zod,
`@supabase/supabase-js` + `@supabase/ssr`. Parsing: `papaparse` (CSV), parser
BibTeX maduro, parser/módulo RIS — todos novos, adicionados **por fatia com tarefa
explícita** (constitution §Portões).

**Storage**: Supabase Postgres (RLS desde a 1ª migration), Supabase Storage (não
exercido na fundo do Marco 1 — PDFs são Marco 2), Supabase Vault (BYOK cifrada).
`pg_trgm` para dedup fuzzy; `pg_cron` para o worker.

**Testing**: Vitest (unit; ≥80% em dedup/triagem/parsing), Playwright (e2e dos
fluxos críticos: importar, triar T/R e Texto completo).

**Target Platform**: Web (deploy Vercel; Supabase como BaaS). Desktop-otimizado
para varredura; mobile-first como baseline responsivo.

**Project Type**: Web application (single-app, não monorepo) — frontend + BaaS.

**Performance Goals**: fila de triagem fluida no teclado com **~5.000 registros**
por Revisão (SC-012); decisão de triagem com latência percebida ~zero (updates
otimistas com rollback).

**Capacidades de fila e acessibilidade do workbench** (FR-039/040/041, SC-013): a
fila suporta **seleção múltipla + ações em lote** (decisões humanas, mesmas regras
das individuais — motivo obrigatório no Texto completo, reversíveis por item,
auditadas); **densidade configurável** (compacto/confortável) preservando o
teclado; e **acessibilidade** (ARIA em listas/grids e popovers, foco visível,
operação 100% por teclado) verificada como portão de qualidade. Componentes em
`src/components/workbench/` e `src/components/ai/`.

**Constraints**: RLS obrigatória desde a origem; nenhuma Edge Function executa
trabalho pesado (enfileira → worker processa); IA só via `LLMProvider`
(sem SDK direto, sem raw write); saída de IA em pt-BR com proveniência; "não
encontrado" como 1ª classe; trilha append-only; sem `any`.

**Scale/Scope**: pesquisador solo (v1); multiusuário modelado no schema, não
operacional. ~5.000 registros/Revisão como alvo de fila. 7 user stories (P1–P3),
38 FR, 12 SC.

**Decisões deixadas ao /plan e agora resolvidas** (ver research.md): auth =
Supabase Auth e-mail/senha (R1); limiar fuzzy = `pg_trgm` ≥0.92 + mesmo ano, fila
humana (R2); jobs assíncronos = `job`/`job_item` + worker `pg_cron` + polling (R3).

## Constitution Check

*GATE: avaliado antes da Fase 0 e re-avaliado após a Fase 1 (Design).*

| # | Princípio | Como o plano cumpre | Status |
|---|-----------|---------------------|--------|
| I | Humano-no-laço + gradiente | IA só sugere; `ai_suggestion.state` (pending…); `screening_decision.actor=human`; FR-024 a IA nunca decide. | ✅ |
| II | Grounding + proveniência | `LLMProvider` força `provenance` e contrato factual `{value,source_span,page}`/`not_found`; Marco 1 ancora em metadado/resumo. | ✅ |
| III | Auditabilidade/reprodutibilidade | `audit_entry` insert-only; dedup/triagem reversíveis por item (Q4); estado de fila na URL (R6/EP-4). | ✅ |
| IV | Isolamento + RLS desde a origem | RLS em todas as tabelas na 1ª migration; `member` modela papéis; solo na v1. | ✅ |
| V | Triagem unificada (workbench) | Importar/Duplicatas/T-R/Texto completo como **modos de uma superfície** (FR-027); fatiação não pode refragmentar (ver Perímetro). | ✅ |
| VI | PRISMA vivo | `prisma_counter` como **view derivada** — fonte única; sem contador guardado divergível (SC-004). | ✅ |
| VII | IA atrás de abstração + BYOK | `LLMProvider` único ponto de chamada; BYOK via Vault (R5); estimativa de custo pré-lote (FR-033); vocabulário visual de IA único. | ✅ |
| VIII | Trabalho pesado = job assíncrono | `import_parse` e `ai_screening_batch` como jobs; Edge enfileira, worker `pg_cron` processa por-item, retomável. | ✅ |

**Restrições adicionais**: stack respeitada (sem dependência fora do ratificado;
novas libs só por tarefa explícita). Idioma pt-BR/UI + original no trecho-fonte;
`DATE` no banco. Pipeline configurável (Viés/Certeza desligadas na v1).

**Resultado do gate (inicial)**: PASS — nenhuma violação. Complexity Tracking vazio.

**Re-avaliação pós-Design (Fase 1)**: o data-model e os contracts mantêm os 8
princípios (RLS em todas as tabelas; `LLMProvider` como único ponto; jobs por-item;
PRISMA como view; workbench unificado). **PASS — sem novas violações.**

## Project Structure

### Documentation (this feature)

```text
specs/001-marco1-nucleo-fluxo/
├── plan.md              # Este arquivo (/speckit.plan)
├── research.md          # Fase 0 — decisões R1..R7
├── data-model.md        # Fase 1 — entidades, RLS, máquina de estados
├── quickstart.md        # Fase 1 — setup + smoke test
├── contracts/           # Fase 1 — interfaces expostas
│   ├── llm-provider.md
│   ├── async-jobs.md
│   └── import-parsers.md
├── spec.md              # Spec clarificada (Sessão A)
├── checklists/
│   └── requirements.md
└── HANDOFF.md           # (a escrever — contrato p/ Sessão B)
```

### Source Code (repository root) — greenfield, layout proposto

Projeto **single-app** Next.js (App Router). Layout-alvo a ser materializado pela
Sessão B (não existe código ainda):

```text
app/                                  # Next.js App Router (Server Components default)
├── (auth)/                           # login/cadastro (Supabase Auth)
├── reviews/
│   ├── page.tsx                      # lista de Revisões do usuário (US1)
│   └── [reviewId]/
│       ├── layout.tsx                # shell: seletor de Revisão, trilho, PRISMA, jobs, custo
│       ├── question/                 # US5 (Pergunta + framework)
│       ├── protocol/                 # US6 (PRISMA-P + travamento/emendas)
│       └── workbench/                # US2/US3/US4 — SUPERFÍCIE ÚNICA (Princípio V)
│           └── page.tsx              # modos: Importar | Duplicatas | T/R | Texto completo
src/
├── components/
│   ├── ai/                           # vocabulário visual de IA (EP-3): suggestion chip,
│   │                                 #   provenance popover, grounding, accept/edit/reject
│   ├── workbench/                    # fila virtualizada, detalhe, barra de modos
│   └── shell/                        # trilho de fases, barra PRISMA viva, painel de jobs
├── hooks/                            # use*.ts (lógica de negócio): useScreening, useDedup, …
├── lib/
│   ├── ai/llm/                       # LLMProvider (abstração) + adapter Anthropic
│   ├── import/                       # parsers RIS/BibTeX/CSV (contrato único)
│   ├── dedup/                        # normalização + similaridade (pg_trgm wrappers)
│   ├── jobs/                         # enqueue client + tipos de job
│   ├── supabase/                     # clients server/client (@supabase/ssr)
│   └── prisma-counters/             # leitura da view de contadores
└── types/                            # tipos compartilhados (sem any)

supabase/
├── migrations/                       # schema + RLS (1ª migration já com RLS) + pg_trgm/pg_cron
└── functions/
    ├── jobs-enqueue/                 # Edge Function: valida/persiste/enfileira (§VIII)
    └── jobs-worker/                  # Edge Function agendada (pg_cron): processa por-item

tests/
├── unit/                             # Vitest (dedup, triagem, parsers — ≥80%)
├── integration/                      # RLS, jobs, travamento de protocolo
└── e2e/                              # Playwright (importar, triar T/R e Texto completo)
```

**Structure Decision**: aplicação web single-app Next.js App Router com Supabase
como BaaS. A escolha-chave é a **superfície única `workbench/`** que hospeda os
quatro modos (Importar/Duplicatas/T-R/Texto completo) como exigência do Princípio V
— nenhuma fatia pode quebrar isso em rotas separadas. Server Components por padrão;
`'use client'` só nas superfícies interativas (workbench, forms, popovers de IA).

## Complexity Tracking

> Constitution Check passou sem violações nos dois gates. **Nenhuma exceção a
> justificar.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (nenhuma) | — | — |

## Perímetro de fatiação (insumo para o HANDOFF.md → Sessão B)

A fatiação é decidida pelo `brainstorming` da Sessão B, mas respeita:
- **Migration + RLS primeiro** (Princípio IV; migrations precedem o código).
- **Workbench não-refragmentável** (Princípio V): Importar/Duplicatas/Triagem
  numa só superfície — nenhuma fatia pode separá-los em telas.
- Cada fatia entregável e testável ponta-a-ponta (lint + tsc + testes verdes).
- União das fatias cobre as 7 user stories; sem sobreposição.
- Dependência de schema do [data-model.md](./data-model.md) ordena as fatias.
- Novas dependências (TanStack Virtual; libs de parsing) só com tarefa explícita.

## Phase 2 (planejamento) — próximos passos

Este comando termina aqui (não gera `tasks.md`). Conforme `PROTOCOLS.md`:
1. Resolver qualquer pendência do `/speckit.analyze` (próximo comando).
2. Escrever `HANDOFF.md` e atualizar o ponteiro `<!-- SPECKIT -->` (já apontando).
3. Sessão B: mapear base de código → `brainstorming` (fatiação) → por fatia
   `writing-plans` → `subagent-driven-development`. **`/speckit.tasks` NÃO roda
   nesta sessão.**
