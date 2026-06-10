# Codebase Map — Marco 2 (Coração AI-first)

> **Propósito.** Primeiro artefato da Sessão B (antes do `brainstorming`). Ancora a
> fatiação no estado **real e herdado** do Marco 1, mapeando os pontos de extensão
> que os contratos (`extraction.md`, `embedding-provider.md`, `pdf-pipeline.md`) e o
> `data-model.md` pressupõem, e registra **achados ancorados** (com `arquivo:linha`)
> que mudam decisões de fatiação. **Não é spec nem plano** — é o retrato do terreno.
>
> Gerado lendo o código (commit `8613cdd`, branch `002-marco2-coracao-ai-first`).
> Marco 1 mergeado em `main` (HEAD `70f76c5`); migrations `0001`–`0011`.

---

## 1. Como usar este mapa

- Cada ponto de extensão abaixo diz **o que existe**, **onde**, e **o que o Marco 2
  acrescenta** (sempre aditivo — Princípio de não-regressão).
- Os **achados ancorados** (§7) são as descobertas que o `brainstorming` precisa
  resolver/respeitar; cada um aponta para um item A\* do `HANDOFF.md` quando aplicável.
- Nada aqui reabre decisão de produto (canônicas em `CONTEXT.md`/`constitution.md`).

---

## 2. Stack instalada (package.json — âncora)

- **Runtime app:** Next.js `^14.2.35` (App Router), React `^18.3.1`, TS `^5.9.3` strict.
- **IA (LLM):** `@anthropic-ai/sdk` `^0.100.1` (já instalado; multimodal disponível p/ OCR).
- **Supabase:** `@supabase/supabase-js` `^2.106.2`, `@supabase/ssr` `^0.3.0`, CLI `^2.102.0`.
- **Dados/UI:** TanStack Query/Table/Virtual, React Hook Form `^7.76`, Zod `^3.25`,
  `react-markdown`+`remark-gfm`.
- **Parsing já presente:** `@retorquere/bibtex-parser`, `papaparse` (import RIS/BibTeX/CSV).
- **Testes:** Vitest `^2.1.9` (`npm test` = `vitest run`), Playwright `^1.60` (`npm run test:e2e`).
- **Gates:** `npm run lint` (`next lint`), `npm run typecheck` (`tsc --noEmit`),
  Husky + lint-staged (eslint --fix + prettier nos arquivos alterados), `npm run gen:types`
  (regenera `src/types/database.ts` do schema local).

**Ausentes (novas deps do Marco 2 — só por tarefa explícita, constitution §Portões):**
biblioteca de extração de texto de PDF compatível com Deno (`unpdf`/`pdfjs-dist` — R1),
cliente Voyage AI (R4), suporte pgvector (extensão Postgres + client query — R5).

---

## 3. Topografia do repo (já existente)

```text
app/
  (auth)/…                         login/signup/actions
  reviews/page.tsx, new/           lista + criação de Revisão
  reviews/[reviewId]/
    layout.tsx, page.tsx           shell (PhaseRail, PrismaBar, JobsPanel)
    question/  protocol/  audit/   fases Marco 1
    workbench/page.tsx + actions.ts   ★ workbench unificado (import/dedup/triagem)
src/
  components/
    ai/                            ★ vocabulário visual de IA — REUSAR (FR-020)
    workbench/                     ModeBar, ScreeningQueue, RecordDetail, painéis
    shell/                         PhaseRail, PrismaBar, JobsPanel
    question/ protocol/ reviews/ providers/
  lib/
    ai/llm/                        ★ LLMProvider (types/anthropic/mock/cost/index)
    jobs/queries.ts                listJobs / countRecords (UI server-side)
    screening/                     ★ enqueue/run/worker/config (job ai_screening_batch)
    byok/                          ★ actions/queries (Vault, 1ª chave)
    audit/ dedup/ prisma/ protocol/ question/ record/ reviews/ search/ shell/
    supabase/                      client/server/admin/middleware
  types/database.ts                tipos gerados do schema (regenerar após migrations)
supabase/
  migrations/0001…0011             schema Marco 1 (Marco 2 começa em 0012)
  functions/
    _shared/jobs/{types,enqueue,worker}.ts   ★ núcleo portátil do job import_parse
    _shared/import/…               parsers RIS/BibTeX/CSV
    jobs-enqueue/index.ts          ★ Edge: casca HTTP (só import_parse hoje)
    jobs-worker/index.ts           ★ Edge: pg_cron tick (só import_parse hoje)
tests/ unit|integration|e2e        Vitest + Playwright (ver §6)
```

★ = ponto de extensão do Marco 2.

---

## 4. Pontos de extensão herdados (o que o Marco 2 estende)

### 4.1 `LLMProvider` — `src/lib/ai/llm/`

- **Interface** (`types.ts:56`): `identity()`, `deriveEligibility`, `draftProtocol`,
  `preclassifyScreening`, `estimateCost({itemCount, kind:'ai_screening_batch'})`.
- **Tipos reusáveis** (NÃO recriar): `FactualValue<T>` (`{value, source_span, page, reason?:'not_found'}`,
  `types.ts:7`), `Provenance` (`{model,version,prompt_or_span,timestamp}`, `:14`),
  `SuggestionState` (`pending|accepted|edited|rejected|inferred`, `:21`),
  `LlmSuggestion<T>` (`:28`), `CostEstimate` (`:51`), `MissingByokError` (`:86`).
- **Resolução do provider** (`index.ts:14`): `getLLMProvider(reviewId)` — `server-only`;
  decifra BYOK via `admin.rpc('get_byok_secret', {p_review_id})`, instancia
  `AnthropicProvider`. **O chamador deve ter verificado membership.**
- **Mock** (`mock.ts:34`): `MockLLMProvider` determinístico, saída pt-BR, sem rede.
  Padrão a **espelhar** para `extractFields`/`ocrPage` e para o `EmbeddingProvider` mock.
- **Marco 2 adiciona** (contrato `extraction.md`): `extractFields(...)`, `ocrPage(...)`,
  e o kind `'ai_extraction_batch'` em `estimateCost`. `FactualValue.page` hoje é sempre
  `null` (sem PDF no Marco 1) — passa a ser preenchido. Adições em `types.ts`,
  `anthropic.ts`, `mock.ts`; **sem refatorar** os métodos existentes.

### 4.2 Infra de job assíncrono — `job` / `job_item`

Tabelas (`0003_search_record_jobs.sql:60`):
- `job(id, review_id, type job_type, status job_status, progress, estimated_cost jsonb,
  actual_cost jsonb, created_at, started_at, finished_at)`.
- `job_item(id, job_id, review_id, status job_item_status, payload jsonb, error, attempts)`.
- Padrão de resiliência já estabelecido: commit **por item**, item falho → `failed`
  (não derruba o job), retomável (só pega `pending`); status final derivado por
  contagem no DB (`worker.ts:87`).

**⚠ Dois padrões de worker coexistem** (achado §7-A):
1. **Edge `jobs-worker`** (`functions/jobs-worker/index.ts`) — disparado por `pg_cron`
   (`0004_jobs_cron.sql`), Deno + SERVICE_ROLE, **filtra `type='import_parse'`** e chama
   `processImportJob` (`_shared/jobs/worker.ts`). Edge `jobs-enqueue` idem só aceita
   `'import_parse'` (`jobs-enqueue/index.ts:11`).
2. **Server-side `processScreeningJob`** (`src/lib/screening/worker.ts:30`) — Node,
   recebe `LLMProvider` **injetado** (resolvido por `getLLMProvider`), processa
   `ai_screening_batch`. Disparado por **gatilho server-side** (não pelo cron Edge —
   ver NOTICE em `0004`). Enqueue via RPC `create_screening_job` (`screening/enqueue.ts:22`).

→ O contrato `pdf-pipeline.md` diz "jobs-worker via pg_cron, estendido". Mas extração/OCR
precisam do `LLMProvider` (1ª chave BYOK decifrada **server-side**, `index.ts` é
`server-only` Node) e embeddings precisam da 2ª chave + Voyage. **Qual padrão cada novo
job segue é decisão do `brainstorming` (A1).** Ver §7-A.

**Marco 2 adiciona** os `type`s `pdf_text_pipeline`, `ai_extraction_batch`,
`embedding_batch` (ALTER aditivo no enum `job_type`, §5) + handlers + enqueue por tipo.

### 4.3 BYOK / Vault — `src/lib/byok/` + RPCs

- **Tabela** `byok_key(id, review_id **unique**, provider llm_provider, vault_secret_id,
  created_at)` (`0002:91`). **⚠ `review_id` é UNIQUE → hoje só UMA chave por Revisão.**
- **RPCs** (`0002`): `set_byok_key(review_id, provider, api_key)` faz **DELETE da chave
  existente** e insere uma nova (`:223`); `get_byok_secret(review_id)` devolve `{provider,
  api_key}` decifrado (`:266`). Grant a `authenticated`.
- **App** (`byok/queries.ts:8`): `getByokStatus(reviewId)` → `{present, provider}`.
  Form de chave: `components/ai/ByokKeyForm.tsx`.
- **Marco 2 adiciona a 2ª chave** (`purpose='embedding'`, Voyage). **A constraint
  `unique(review_id)` e as duas RPCs precisam mudar** para acomodar duas chaves por
  Revisão (ex.: `unique(review_id, purpose)`; `set/get` parametrizados por `purpose`).
  Achado §7-B — afeta a fatia de RAG/2ª chave e relaciona A2/A3.

### 4.4 `ai_suggestion` / `ai_usage` / auditoria — transversais (reusados)

- **`ai_suggestion`** (`0002:21`): `target_kind ai_target_kind`, `target_id`, `output jsonb`,
  `provenance jsonb` (CHECK exige `model/version/prompt_or_span/timestamp`, `:32`),
  `state suggestion_state`, `grounding jsonb`, `not_found bool`. **A extração reusa esta
  entidade** (spec Key Entities; contrato `extraction.md`): cria `ai_suggestion` com
  `target_kind='extraction'` (ALTER aditivo no enum, §5), `grounding` apontando a camada
  de texto, `state` `pending`/`inferred`. Padrão de escrita: ver `screening/worker.ts:67`.
- **`ai_usage`** (`0002:100`): `phase **text**` (NÃO enum → `'extraction'`/`'embedding'`
  **sem ALTER**), `tokens_in/out`, `cost jsonb`, `job_id`. Índice `(review_id, phase)`.
  Reusar para a contabilidade de custo (FR-023/FR-006).
- **Auditoria** `audit_entry` (`0001`) append-only, atores `human|ai|system`
  (`audit_actor_type`). RPCs do Marco 1 já inserem auditoria atômica
  (ex.: `create_import_job` insere `audit_entry`, `0003:146`). Padrão a seguir para
  anexar/processar/ratificar/reprocessar (FR-029).

### 4.5 Vocabulário visual de IA — `src/components/ai/` (REUSAR, FR-020/EP-3)

Componentes presentacionais já prontos (NÃO reinventar):
- `SuggestionChip({state})` (`SuggestionChip.tsx:4`) + tokens em `state.ts`
  (`SUGGESTION_STATE_LABEL`/`SUGGESTION_STATE_CLASS`, cor/borda distinta de dado humano).
- `ProvenancePopover({provenance})`, `SuggestionActions({…})` (accept/edit/reject),
  `NotFound({what})` (renderiza "não encontrado" 1ª classe), `AsyncActionButton`,
  `ByokKeyForm`.
- **Sem visualizador de PDF lado-a-lado** (v1.1): o "grounding highlight" reusa este
  vocabulário exibindo trecho-fonte citado + página (spec Assumptions).

### 4.6 Workbench / trilho de fases / onde o PDF anexa

- **Modos do workbench** (`components/workbench/ModeBar.tsx:3`): `import | duplicates |
  title_abstract | full_text`. A clarificação (spec FR-001) põe o **upload de PDF no modo
  `full_text` ("Texto completo")** — extensão **aditiva** ao modo existente, **sem**
  refragmentar a triagem (Princípio V). Hoje o detalhe do registro
  (`workbench/RecordDetail.tsx`) é deliberadamente **sem IA** (T/R); o anexo de PDF entra
  como afordância no modo full_text.
- **Trilho de fases** (`lib/shell/phases.ts`): `PhaseKey` =
  `question|protocol|import|duplicates|screening_ts|screening_ft|risk_of_bias|certainty`.
  Pipeline + opcionais (`OPTIONAL`, `:94`) renderizados por `PhaseRail`. **A Extração
  (US3) é fase distinta** (D19/plan §Structure): alcançada pelo trilho — ver §7-C para a
  decisão de como acrescentá-la sem quebrar a derivação de `current/done`.
- **`corpus_state`** (`0003:11`, enum): `imported, active, duplicate_exact,
  duplicate_fuzzy, maybe_ts, included_ts, excluded_ts, included_ft, excluded_ft`.
  Upload de PDF habilitado para `corpus_state ∈ {included_ts, included_ft}` (passou T/R);
  **extração opera sobre estudos** (`included_ft`). Sem novo estado — leitura do existente.

---

## 5. Enums do schema → ALTER aditivo (Marco 2, a partir de 0012)

| Enum (origem) | Valores atuais | Marco 2 adiciona | Observação |
|---|---|---|---|
| `job_type` (`0003:18`) | `import_parse`, `ai_screening_batch` | `pdf_text_pipeline`, `ai_extraction_batch`, `embedding_batch` | `ALTER TYPE … ADD VALUE` (aditivo) |
| `ai_target_kind` (`0002:16`) | `eligibility`, `protocol_draft`, `screening` | `extraction` | aditivo |
| `byok_key.provider` (`llm_provider`, `0002:18`) | `anthropic` | (avaliar) provider de embedding — ou **coluna `purpose`** separada | ver §7-B |
| `ai_usage.phase` | (é `text`, não enum) | `extraction`, `embedding` | **sem ALTER** |
| `suggestion_state` (`0002:17`) | já tem `inferred` | — | nada a fazer |

**Tabelas novas** (data-model.md): `document`, `text_layer`, formulário de extração +
campo + valor de extração, `embedding_chunk` (+ extensão `vector`/pgvector + HNSW),
**Storage policies** (bucket privado, path `review/<review_id>/record/<record_id>/<document_id>.pdf`).
Ordem: **migration + RLS primeiro** (Princípio IV) — precede o código que as consome.

---

## 6. Convenções de teste (espelhar)

- **Unit** (`tests/unit/…`): contrato do provider em `ai/llm-contract.test.ts`,
  componentes em `*.test.tsx` (Testing Library), libs puras. Espelhar para
  `extractFields`/grounding/not_found/inferred, chunking, mocks (contrato `extraction.md`).
- **Integration** (`tests/integration/…`): muitos testes batem **direto na camada de DB**
  via `helpers/supabase.ts` (NÃO via `createClient()` server — `cookies()` lança fora de
  request). Há `rls.*.test.ts` por subsistema — espelhar para RLS de Storage e busca
  escopada (SC-008/SC-011), pipeline híbrido, re-extração (FR-019a).
- **E2E** (`tests/e2e/…`): fluxos críticos + perf (`screening-perf.spec.ts`). Espelhar
  para ingestão+extração e o **gate de ~500 PDFs** (SC-013).
- **Coverage** mínimo 80% nas funções críticas (constitution).

---

## 7. Achados ancorados (entradas para o `brainstorming`)

### §7-A — Dois padrões de worker; qual cada novo job segue (→ A1, Princípio VIII)
O Edge `jobs-worker`/pg_cron só processa `import_parse` com SERVICE_ROLE e **não tem acesso
ao `LLMProvider`** (`src/lib/ai/llm/index.ts` é `server-only` Node, decifra BYOK server-side).
O `ai_screening_batch` (também IA) roda por `processScreeningJob` **server-side** com o
provider **injetado**. O contrato `pdf-pipeline.md` cita o Edge worker, mas extração/OCR/
embeddings exigem chaves BYOK decifradas e SDKs (Anthropic/Voyage). **Decisão de fatiação:**
(a) os jobs de IA do Marco 2 (`ai_extraction_batch`, `embedding_batch`, e o OCR dentro de
`pdf_text_pipeline`) seguem o padrão **server-side** do screening (provider injetado), ou
(b) o Edge worker é estendido para resolver BYOK e chamar provedores em Deno? A parte
**determinística** (extração nativa de texto) pode rodar no Edge/Deno; a parte **multimodal/
LLM** provavelmente quer o caminho server-side. Surfacar e decidir antes de fatiar o pipeline.

### §7-B — `byok_key` é UNIQUE por Revisão; a 2ª chave exige mudança de schema (→ A2/A3, RAG)
`byok_key.review_id` é `unique` e `set_byok_key` **deleta** antes de inserir
(`0002:91,223`). A 2ª chave (embedding/Voyage) **não cabe** no modelo atual sem migration:
trocar para `unique(review_id, purpose)` e parametrizar `set_byok_key`/`get_byok_secret`/
`getByokStatus` por `purpose`. É mudança **aditiva mas tocando código herdado** — cai na
exceção "tarefa explícita justificada". Atribuir à fatia de RAG/2ª chave (US5).

### §7-C — A Extração é fase nova no trilho (→ Princípio V, plan §Structure)
`phases.ts` deriva `current`/`done` por uma fronteira linear sobre `PIPELINE`. A Extração
(`app/reviews/[reviewId]/extraction/`) é **fase distinta pós-triagem** (D19). Acrescentá-la
ao `PhaseKey`/`PIPELINE` é mexer em código herdado de shell — extensão **aditiva** legítima,
mas precisa de critério de `completed` próprio e não pode quebrar o cálculo das fases T/R.
A busca semântica (US5) provavelmente é uma **superfície** (`/search`), não fase do pipeline.
Decidir o encaixe no trilho na fatiação.

### §7-D — `FactualValue.page` passa a ser real (→ II, extração)
Hoje `page` é sempre `null` (sem PDF). Com PDF, o grounding referencia `text_layer` +
`page`. O `ai_suggestion.grounding jsonb` já existe (`0002:29`) e acomoda
`{text_layer_id, page, source_span, origin}` sem ALTER — confirmar no data-model.

### §7-E — Storage ainda não existe; é fundação da fatia 1 (→ IV, US1)
Não há bucket nem `document`/`text_layer`. A Edge `jobs-enqueue` precisa **validar PDF
(MIME + integridade + teto de tamanho/páginas, A4) e só enfileirar** (FR-005); o binário
vai ao Storage com policy por `review_id` no path **antes** do enqueue. Tudo isso é
pré-requisito de schema/RLS da primeira fatia (Princípio IV: migration + RLS primeiro).

---

## 8. Restrições de não-regressão (Marco ≥ 2) que o map confirma

- **NÃO refatorar** o workbench/triagem, `phases.ts`, `screening/*`, `import/*` — apenas
  **estender** aditivamente (upload no modo full_text; fase Extração nova; novos `type`s
  de job). Exceção pré-autorizada: a afordância de upload no modo Texto completo.
- **Reusar** `components/ai/*` (FR-020) e os tipos de `lib/ai/llm/types.ts` (não duplicar
  `FactualValue`/`Provenance`/`SuggestionState`).
- **IA só via abstração** (§VII): `extractFields`/`ocrPage` no `LLMProvider`; embeddings no
  novo `EmbeddingProvider` — nenhum SDK direto em código de feature.
- **Edge nunca faz parsing pesado** (§VIII): valida/persiste/enfileira → worker processa.
- `ALTER`s a enums são **aditivos**; migrations a partir de `0012`; `gen:types` após.
