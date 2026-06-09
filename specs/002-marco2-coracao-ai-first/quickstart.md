# Quickstart — Marco 2: Coração AI-first

**Feature**: `002-marco2-coracao-ai-first` | **Date**: 2026-06-09

> Como subir e validar a fatia do Marco 2 localmente, **sobre** o Marco 1 já
> mergeado. Pré-requisito: a Sessão B já executou as fatias (este doc descreve o
> estado-alvo, não a execução). Stack conforme constitution §Restrições.

## Pré-requisitos
- O ambiente do Marco 1 funcionando (Node 18+, Docker, Supabase CLI).
- **1ª chave BYOK** (LLM — Anthropic/Claude): extração por IA e OCR multimodal.
  Sem ela, a extração é manual sobre o formulário (FR-028, edge case).
- **2ª chave BYOK** (Embeddings — Voyage AI), **distinta** da 1ª: busca semântica.
  Sem ela, o RAG fica indisponível; o resto segue operável (FR-028).

## Setup (deltas sobre o Marco 1)

```bash
npm install                    # novas libs (parsing de PDF, pgvector client) — por fatia
supabase start                 # Postgres + Auth + Storage + Edge runtime locais
supabase db reset              # aplica migrations 0001..0011 + as novas (0012+):
                               #   extensão `vector` (pgvector), bucket/policies de Storage,
                               #   document/text_layer/extraction_*/embedding_chunk,
                               #   ALTERs (ai_suggestion.target_kind, job.type, byok_key.purpose)
npm run dev                    # http://localhost:3000
```

Variáveis de ambiente (`.env.local`) — iguais ao Marco 1:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **BYOK**: ambas as chaves (LLM e Embeddings) são cadastradas **pela UI** e cifradas
  no **Supabase Vault** — nunca em env var de produção. A 2ª chave é distinta da 1ª.

## Smoke test do fluxo (corresponde aos Acceptance Scenarios)

1. **Pré-condição**: numa Revisão do Marco 1, tenha pelo menos um **estudo**
   (record `included_ts`/`included_ft`) e ambas as chaves BYOK cadastradas.
2. **Ingestão de PDF (US1)**: anexe ao estudo um PDF **com camada de texto** e um
   PDF **escaneado**; veja o `processing_status` evoluir (`queued → processing →
   text_ready`); confirme que o texto saiu por **job assíncrono** (o upload só
   enfileira) e que a origem da camada é `nativo` vs `ocr_ia` (SC-002).
3. **Isolamento de Storage (US1)**: confirme que um usuário de outra Revisão **não**
   acessa o PDF por URL/objeto direto (SC-011).
4. **Formulário de extração (US2)**: monte o formulário (campos `text`/`number`/
   `date`/`boolean`/`select`); confirme que é **um por Revisão** e que serve de base
   à extração.
5. **Extração por IA + validação (US3)**: acione a extração num estudo; confira que
   cada campo factual cita **trecho-fonte + página** (ou **"não encontrado"**
   explícito); que campos **inferidos** aparecem marcados; que a **proveniência**
   está completa; aceite/edite/rejeite e veja o estado registrado. Confirme que
   **nada finaliza sem ratificação** (SC-003/SC-004/SC-005) e que o **vocabulário
   visual de IA do Marco 1 é reusado** (SC-009).
6. **Re-extração (US3/Q4)**: re-execute a extração no mesmo estudo; confirme que as
   novas sugestões entram **pendentes ao lado** dos valores validados, sem
   sobrescrever (FR-019a).
7. **Lote + custo (US4)**: selecione vários estudos e acione a extração em lote;
   confirme a **estimativa de custo/tokens antes** de executar (SC-006); acompanhe o
   progresso; force a falha de um item e veja o lote **continuar** (resiliência
   por-item, SC-007); cheque o **consumo acumulado por Revisão/fase**.
8. **Busca semântica (US5)**: faça uma consulta em linguagem natural; confirme que
   retornam **trechos ancorados** (página/posição + estudo) e que a busca é
   **escopada à Revisão** (sem vazamento, SC-008); confirme que os embeddings foram
   gerados por **job assíncrono**.
9. **Idioma (transversal)**: saídas de IA em **pt-BR**, trecho-fonte no **idioma
   original** do PDF (SC-010).

## Verificação (portões de qualidade — constitution §Portões)

```bash
npm run lint          # deve passar (sem any)
npx tsc --noEmit      # type-check limpo
npm run test          # Vitest — unit/integração (extração, pipeline, embeddings, RLS)
npm run test:e2e      # Playwright — ingestão+extração por IA; gate ~500 PDFs (SC-013)
```

## Notas
- A extração lê o **texto do documento diretamente**; a busca semântica (US5) é
  **independente** e separável (clarificação Q1) — US1–US4 funcionam sem o stack de
  embeddings.
- **Sem visualizador de PDF lado-a-lado** (v1.1): o grounding mostra o **trecho-fonte
  citado + página**, não um overlay sobre a página renderizada.
- Síntese/relatório/exportações e fluxograma PRISMA renderizado são **Marco 3**;
  risco de viés e CERQual reusam a **engine de formulário** depois do núcleo.
