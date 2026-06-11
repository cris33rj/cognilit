# Implementation Plan: Marco 2 — Coração AI-first

**Branch**: `002-marco2-coracao-ai-first` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-marco2-coracao-ai-first/spec.md`

## Summary

Sobre o esqueleto andante do Marco 1 (já mergeado em `main`), o Marco 2 entrega o
**coração AI-first**: anexar PDFs a estudos (Storage escopado por Revisão), extrair
seu texto por **pipeline assíncrono e híbrido** (camada nativa determinística; páginas
escaneadas via LLM multimodal como OCR, cada camada com `origin` `nativo`/`ocr_ia`),
montar um **formulário de extração configurável** (um por Revisão), e deixar um agente
LLM **preencher os campos a partir do texto do PDF** com **grounding** (trecho-fonte +
página), **proveniência obrigatória** e **estado explícito**, sob **validação humana no
laço** (aceitar/editar/rejeitar; a IA nunca finaliza). Lotes rodam como **jobs
assíncronos** com **estimativa de custo antes** e **consumo acumulado por Revisão/fase**.
Por fim, **busca semântica (RAG)** sobre os PDFs, escopada por Revisão, via
`EmbeddingProvider` (Voyage, 2ª chave BYOK) em pgvector + HNSW.

Abordagem técnica (derivada da [research.md](./research.md), dentro da stack ratificada
e **ancorada no código real do Marco 1**): estende o `LLMProvider` (`src/lib/ai/llm/`)
com `extractFields`/`ocrPage`; cria a abstração `EmbeddingProvider`
(`src/lib/ai/embedding/`); reutiliza a infra `job`/`job_item` + `jobs-enqueue` +
`jobs-worker` (`pg_cron`) adicionando os `type`s `pdf_text_pipeline`,
`ai_extraction_batch`, `embedding_batch`; adiciona PDFs no Supabase Storage com RLS por
path; e estende `byok_key` para a 2ª chave. Migrations novas a partir de `0012`
(extensão `vector`/pgvector + HNSW, Storage policies, tabelas de documento/texto/
formulário/extração/embedding, e `ALTER`s nos enums existentes). A extração **não**
depende dos embeddings (US3 ⟂ US5, clarificação Q1).

## Technical Context

**Language/Version**: TypeScript (strict) — Next.js 14+ (App Router), React 18+.
Edge Functions em Deno/TypeScript (runtime Supabase), reusando `jobs-enqueue`/
`jobs-worker` existentes.

**Primary Dependencies** (existentes, reusadas): `@anthropic-ai/sdk` (LLM, multimodal
para OCR), `@supabase/supabase-js` + `@supabase/ssr`, TanStack Query/Table/Virtual,
React Hook Form + Zod. **Novas, adicionadas por tarefa explícita por fatia**
(constitution §Portões): biblioteca de extração de texto de PDF compatível com Deno
(`unpdf`/`pdfjs-dist` — R1, validar contra PDFs reais), cliente/SDK **Voyage AI**
(embeddings — R4), e o suporte **pgvector** (extensão no Postgres; client query — R5).

**Storage**: Supabase Postgres (RLS desde a origem; **+ extensão `vector`/pgvector**
com índice **HNSW** — R5), **Supabase Storage** (bucket privado para PDFs, policies por
`review_id` no path — R7), Supabase Vault (BYOK; **2ª chave** para embeddings — R4).
`pg_cron` para o worker (herdado).

**Testing**: Vitest (unit/integração: extração com grounding, pipeline híbrido,
embeddings/busca, RLS de Storage), Playwright (e2e: ingestão+extração por IA; gate de
escala ~500 PDFs — SC-013). Mocks de `LLMProvider`/`EmbeddingProvider` (sem rede).

**Target Platform**: Web (deploy Vercel; Supabase como BaaS). Worker em Edge Function
agendada.

**Project Type**: Web application (single-app, não monorepo) — frontend + BaaS.

**Performance Goals**: pipeline de texto, extração em lote e geração de embeddings
processam **~500 PDFs por Revisão** (dezenas de páginas cada) de forma assíncrona,
retomável e resiliente por-item, sem bloquear a UI (SC-013). Busca semântica por HNSW
sobre o corpus da Revisão.

**Constraints**: RLS obrigatória em todas as tabelas novas e no Storage; **a Edge
Function nunca faz parsing pesado** (valida/persiste/enfileira → worker processa,
§VIII); IA só via `LLMProvider`/`EmbeddingProvider` (sem SDK direto, sem raw write,
§VII); grounding obrigatório com `source_span`+página e `origin` da camada; "não
encontrado" e `inferido` como 1ª classe; a IA **nunca finaliza** um valor (§I);
saída pt-BR com trecho no original (D24); trilha append-only; sem `any`. **2ª chave de
embeddings distinta da 1ª** e cifrada.

**Scale/Scope**: pesquisador solo (v1). ~500 PDFs/Revisão como alvo. 5 user stories
(P1×3, P2×2), 32 FR (FR-001..030 + FR-017a/019a), 13 SC.

**Decisões deixadas ao /plan e agora resolvidas** (ver [research.md](./research.md)):
R1 extração nativa no worker (`unpdf`/pdf.js, por tarefa); R2 detecção por densidade →
OCR multimodal via `LLMProvider` (`origin=ocr_ia`); R3 reuso de `job`/`job_item` +
novos `type`s, item por PDF/estudo/chunk; R4 `EmbeddingProvider` Voyage + 2ª chave;
R5 pgvector dim do provedor (1024) + metadado de dim + HNSW cosseno; R6 chunking
ancorado; R7 Storage RLS por path; R8 `extractFields` direto sobre o texto; R9
`estimateCost`/`ai_usage` para extração e embeddings.

**Relação com Marco 1 (não-regressão)**: Marco 2 **estende** entidades/contratos
existentes (`ai_suggestion`, `job`, `byok_key`, `ai_usage`, `LLMProvider`) e **não
refatora** o código do Marco 1 exceto onde uma tarefa o exigir explicitamente. O
"grounding highlight" reusa o vocabulário visual do Marco 1 (EP-3/FR-020); **não** há
visualizador de PDF lado-a-lado (v1.1).

## Constitution Check

*GATE: avaliado antes da Fase 0 e re-avaliado após a Fase 1 (Design).*

| # | Princípio | Como o plano cumpre | Status |
|---|-----------|---------------------|--------|
| I | Humano-no-laço + gradiente | Extração só **sugere**; `extraction_value.final_value` só por ação humana; FR-019 a IA nunca finaliza; `state` pending/…/inferred visível. | ✅ |
| II | Grounding + proveniência | `extractFields` retorna `{value,source_span,page}`/`not_found`; `grounding`→`text_layer` com `origin`; `provenance` obrigatória; campos `inferido` (FR-014). | ✅ |
| III | Auditabilidade/reprodutibilidade | Anexar/processar/ratificar/reprocessar → `audit_entry` (insert-only); re-extração não sobrescreve (FR-019a). | ✅ |
| IV | Isolamento + RLS desde a origem | RLS em todas as tabelas novas; **Storage** com policy por `review_id` no path; busca semântica filtra `review_id` (SC-011). | ✅ |
| V | Triagem unificada (workbench) | O anexo de PDF (US1) **estende** o **modo Texto completo do workbench** existente (afordância de upload), sem criar tela separada nem refragmentar a triagem; a Extração (US3) é **fase distinta** (D19) alcançada pelo trilho de fases. | ✅ |
| VI | PRISMA vivo | Sem impacto nos contadores (extração é pós-triagem); nada que divirja do PRISMA do Marco 1. | ✅ (n/a) |
| VII | IA atrás de abstração + BYOK | `LLMProvider` (estendido) e novo `EmbeddingProvider` como pontos únicos; 2ª chave via Vault; estimativa pré-lote (FR-022); vocabulário visual de IA **reusado**. | ✅ |
| VIII | Trabalho pesado = job assíncrono | `pdf_text_pipeline`/`ai_extraction_batch`/`embedding_batch` como jobs; Edge **só enfileira**; worker `pg_cron` por-item, retomável, resiliente. | ✅ |

**Restrições adicionais**: stack respeitada (novas libs — PDF parsing, Voyage,
pgvector — só **por tarefa explícita** por fatia); idioma pt-BR/UI + original no
trecho-fonte; `DATE` no banco; pipeline configurável (Viés/Certeza ainda desligadas —
a engine de formulário só é projetada para acomodá-las, não as implementa).

**Resultado do gate (inicial)**: PASS — nenhuma violação. Complexity Tracking vazio.

**Re-avaliação pós-Design (Fase 1)**: o data-model e os contracts mantêm os 8
princípios (RLS em todas as tabelas novas + Storage; `LLMProvider`/`EmbeddingProvider`
como pontos únicos; jobs por-item retomáveis; extração só sugere; US3 independente de
US5). Os `ALTER`s a enums do Marco 1 são aditivos (sem remoção/refator). **PASS — sem
novas violações.**

## Project Structure

### Documentation (this feature)

```text
specs/002-marco2-coracao-ai-first/
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0 — decisões R1..R9
├── data-model.md        # Fase 1 — entidades novas + ALTERs, RLS, máquinas de estado
├── quickstart.md        # Fase 1 — setup (deltas) + smoke test
├── contracts/           # Fase 1 — interfaces expostas
│   ├── extraction.md         # LLMProvider estendido (extractFields/ocrPage)
│   ├── embedding-provider.md # EmbeddingProvider (Voyage, pgvector/HNSW)
│   └── pdf-pipeline.md       # jobs (pdf_text_pipeline/extraction/embedding) + Storage
├── spec.md              # Spec clarificada (Sessão A)
├── checklists/
│   └── requirements.md
└── HANDOFF.md           # (a escrever — contrato p/ Sessão B)
```

### Source Code (repository root) — extensão do código existente

Layout-alvo do Marco 2 sobre a estrutura **já existente** do Marco 1 (novos caminhos
marcados `[novo]`; o resto é estendido):

```text
app/reviews/[reviewId]/
├── extraction/              [novo] fase Extração (alcançada pelo trilho de fases, D19)
│   └── page.tsx             #  formulário configurável + extração por estudo + validação
├── search/                 [novo] busca semântica (RAG) sobre o corpus (US5)
│   └── page.tsx
└── (workbench/, question/, protocol/, audit/  — Marco 1, NÃO refatorar)

src/
├── components/
│   ├── ai/                 # vocabulário visual de IA do Marco 1 — REUSADO (FR-020)
│   ├── extraction/         [novo] form builder, grid de campos, painel de validação
│   └── documents/          [novo] upload de PDF (montado no modo Texto completo do
│                           #  workbench — estende, não refragmenta), status, lista
├── hooks/                  # use*.ts — useExtraction, useDocuments, useSemanticSearch [novos]
├── lib/
│   ├── ai/
│   │   ├── llm/            # LLMProvider — ESTENDER (extractFields/ocrPage/estimateCost)
│   │   └── embedding/      [novo] EmbeddingProvider (types/mock/voyage adapter)
│   ├── documents/          [novo] upload client, path helpers, status
│   ├── extraction/         [novo] form engine, mapeamento campo→sugestão, re-extração
│   ├── search/             [novo] query → embedQuery → pgvector (server-side)
│   ├── jobs/               # queries.ts — ESTENDER novos type/payloads
│   └── byok/               # actions/queries — ESTENDER 2ª chave (purpose=embedding)
└── types/                  # tipos compartilhados (database.ts regenerado)

supabase/
├── migrations/             # 0012+: pgvector+HNSW, Storage policies, tabelas novas, ALTERs
└── functions/
    ├── jobs-enqueue/       # ESTENDER: validar PDF + novos type (só enfileira, §VIII)
    └── jobs-worker/        # ESTENDER: handlers pdf_text_pipeline/extraction/embedding

tests/
├── unit/                   # extração (grounding/not_found/inferred), chunking, mocks
├── integration/            # pipeline híbrido, RLS de Storage, busca escopada, re-extração
└── e2e/                    # ingestão+extração por IA; gate ~500 PDFs (SC-013)
```

**Structure Decision**: aplicação web single-app Next.js App Router com Supabase como
BaaS — a mesma do Marco 1, **estendida**. As escolhas-chave: (1) Extração é uma **fase
distinta** (`app/reviews/[reviewId]/extraction/`), alcançada pelo trilho de fases — não
toca nem refragmenta o workbench de triagem (Princípio V preservado); (2) dois eixos de
IA atrás de **abstrações separadas** (`lib/ai/llm` estendido + `lib/ai/embedding` novo),
nunca SDK direto (§VII); (3) todo trabalho pesado nos **jobs existentes** estendidos,
com a Edge só enfileirando (§VIII). Server Components por padrão; `'use client'` nas
superfícies interativas (form builder, painel de validação, busca).

## Complexity Tracking

> Constitution Check passou sem violações nos dois gates. **Nenhuma exceção a
> justificar.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (nenhuma) | — | — |

## Perímetro de fatiação (insumo para o HANDOFF.md → Sessão B)

A fatiação é decidida pelo `brainstorming` da Sessão B, mas respeita:
- **Migration + RLS primeiro** (Princípio IV): tabelas novas, Storage policies e a
  extensão `vector`/HNSW precedem o código que os consome.
- **Não-regressão do Marco 1** (Princípio V + diretiva de não-regressão): nenhuma fatia
  refatora o workbench/triagem nem código herdado, exceto onde uma tarefa o exigir
  explicitamente e com justificativa. **Exceção explícita e justificada**: a fatia de
  ingestão **adiciona** a afordância de upload de PDF ao **modo Texto completo do
  workbench** (clarificação 2026-06-09) — uma extensão aditiva que **não** refragmenta
  a triagem (Princípio V preservado). Os `ALTER`s a enums são **aditivos**.
- **US3 (extração) independente de US5 (busca semântica)** — clarificação Q1: a fatia
  de extração não depende da fatia de embeddings; ordenar US5 depois.
- **Dependência natural**: ingestão+pipeline de texto (US1) precede extração (US3) e
  embeddings (US5); formulário (US2) precede extração (US3); lote (US4) estende a
  extração (US3).
- Cada fatia entregável e testável ponta-a-ponta (lint + tsc + testes verdes).
- União das fatias cobre as 5 user stories; sem sobreposição.
- Dependência de schema do [data-model.md](./data-model.md) ordena as fatias.
- Novas dependências (lib de PDF, Voyage, pgvector) **só com tarefa explícita**.

## Phase 2 (planejamento) — próximos passos

Este comando termina aqui (não gera `tasks.md`). Conforme `PROTOCOLS.md`:
1. Rodar `/speckit.analyze` (próximo) e resolver qualquer divergência **antes** do
   `HANDOFF.md`.
2. Escrever `HANDOFF.md` (com `## Estado dos marcos anteriores`, diretiva de
   não-regressão, mapeamento como 1º passo, perímetro de fatiação, e reafirmação das
   três decisões de arquitetura — `PROTOCOLS.md` §"Marcos subsequentes") e confirmar o
   ponteiro `<!-- SPECKIT -->` (atualizado neste comando).
3. Sessão B: mapear base de código → `brainstorming` (fatiação) → por fatia
   `writing-plans` → `subagent-driven-development`. **`/speckit.tasks` NÃO roda nesta
   sessão.**
