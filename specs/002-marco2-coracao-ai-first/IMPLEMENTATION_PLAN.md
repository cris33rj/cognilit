# Fatia 6 — Busca semântica / RAG (US5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O pesquisador faz uma **consulta semântica** em linguagem natural sobre os PDFs ingeridos da Revisão e recebe os trechos mais similares **ancorados a página/posição e ao estudo de origem**; os embeddings são gerados por um **job assíncrono** retomável/resiliente via uma nova abstração `EmbeddingProvider` (default Voyage AI) com uma **2ª chave BYOK** cifrada e distinta da do LLM; sem essa chave, a busca é sinalizada **indisponível** e o resto do produto segue operável.

**Architecture:** Segundo eixo de IA (§VII), **independente** do `LLMProvider` e da extração (US3 ⟂ US5, Q1). Espelha três padrões já no repo: (1) a abstração do LLM (`src/lib/ai/llm/` → `types`/`mock`/`adapter`/`index`) vira `src/lib/ai/embedding/`; (2) a infra de lote da Fatia 5 (`src/lib/extraction/` → `enqueue`/`batch-worker`/`batch-run`/`queries`) vira `src/lib/embedding/`; (3) o BYOK via Vault (`set_byok_key`/`get_byok_secret`) é **parametrizado por `purpose`** para acomodar a 2ª chave — única mudança que toca código herdado (exceção justificada, §7-B da `slicing.md`). Vetores em **pgvector** (`vector(1024)`), busca por **HNSW** `vector_cosine_ops`, **escopada por `review_id`** (RLS + filtro explícito) via RPC `security definer`.

**Tech Stack:** Next.js 14 App Router · Supabase (Postgres + RLS + Vault + **pgvector/HNSW**) · TypeScript strict · Vitest. Embeddings: **Voyage AI** (`voyage-3`, 1024 dim) via adapter `fetch` sobre a REST API (sem novo SDK — ver Decisão D-F6.1 abaixo). Jobs reusam `job`/`job_item` (novo `type='embedding_batch'`).

---

## Decisões de implementação a ratificar no CHECKPOINT 2

Antes de executar, o desenvolvedor confirma estes dois pontos (são as únicas zonas cinzentas; o resto deriva de `slicing.md`/`contracts`/`research`):

- **D-F6.1 — Cliente Voyage: `fetch` à REST API, sem novo SDK.** A `slicing.md` previu "nova dep: cliente Voyage AI (R4) por tarefa explícita". Este plano implementa o `VoyageProvider` como **adapter fino sobre `fetch`** ao endpoint documentado `POST https://api.voyageai.com/v1/embeddings` — **zero dependências novas**, totalmente especificável (sem ambiguidade de versão de SDK), e honra o portão da constitution (nenhuma dep entra "de fininho"). Se o desenvolvedor preferir o pacote `voyageai`, é troca isolada **dentro** de `voyage.ts` (Task 5) sem tocar nenhum outro arquivo. **Recomendado: `fetch`.**
- **D-F6.2 — Granularidade do job `embedding_batch`: item = um documento.** R3 admite "um chunk **ou documento**". Este plano usa **item = `document`** (o worker chunka a `text_layer` do documento, embeda todos os chunks e insere) — espelha 1:1 a Fatia 5 (item = estudo), mantém cada item curto e a resiliência por-item clara. **Recomendado.**

---

## File Structure

**Migration (Princípio IV — primeiro):**
- Create: `supabase/migrations/0017_embedding_rag.sql` — extensão `vector`; tabela `embedding_chunk` + índice HNSW + RLS; `ALTER TYPE job_type ADD VALUE 'embedding_batch'`; BYOK 2ª chave (`byok_purpose` enum, `ALTER TYPE llm_provider ADD VALUE 'voyage'`, coluna `purpose`, unicidade `(review_id, purpose)`, RPCs `set_byok_key`/`get_byok_secret` reparametrizadas por `purpose`); RPCs `create_embedding_job` (enqueue) e `match_embedding_chunks` (busca); comentário explícito da **dimensão fixa do índice vs. variável do schema (A3)**.

**Tipos regenerados:**
- Modify: `src/types/database.ts` — regen após a migration (embedding_chunk, byok_key.purpose, job_type, novas RPCs).

**Abstração `EmbeddingProvider` (espelha `src/lib/ai/llm/`):**
- Create: `src/lib/ai/embedding/types.ts` — `EmbeddingIdentity`, `Chunk`, `EmbeddedChunk`, `SemanticHit`, `EmbeddingProvider`, `MissingEmbeddingKeyError`.
- Create: `src/lib/ai/embedding/mock.ts` — `MockEmbeddingProvider` (vetores determinísticos, sem rede).
- Create: `src/lib/ai/embedding/voyage.ts` — `VoyageProvider` (adapter `fetch`).
- Create: `src/lib/ai/embedding/index.ts` — `getEmbeddingProvider(reviewId)` resolve a **2ª chave** (`get_byok_secret(p_purpose='embedding')`).

**BYOK 2ª chave (toca código herdado — exceção justificada):**
- Modify: `src/lib/byok/queries.ts` — `getByokStatus(reviewId, purpose='llm')`.
- Modify: `src/lib/byok/actions.ts` — `saveByokKey(reviewId, formData, opts?)` com `purpose`/`provider`/revalidate por fase.
- Modify: `src/lib/ai/llm/index.ts` — `getLLMProvider` passa `p_purpose: 'llm'` explícito.

**Chunking + lote de embeddings (espelha `src/lib/extraction/`):**
- Create: `src/lib/embedding/chunk.ts` — chunking ancorado a página/posição (puro, testável).
- Create: `src/lib/embedding/queries.ts` — `listEmbeddingCandidates` (documentos processados ainda não embedados).
- Create: `src/lib/embedding/enqueue.ts` — `enqueueEmbeddingJob` (via RPC `create_embedding_job`).
- Create: `src/lib/embedding/batch-worker.ts` — `processEmbeddingJob` (por documento; chunk→embed→insert + `ai_usage(phase='embedding')`; resiliente/retomável).
- Create: `src/lib/embedding/batch-run.ts` — `runEmbeddingBatchWorkerWith(admin, provider, reviewId)`.
- Create: `src/lib/embedding/search.ts` — `semanticSearch` (embedQuery → RPC `match_embedding_chunks`).

**Server Actions + UI (surface `app/reviews/[reviewId]/search/`):**
- Create: `app/reviews/[reviewId]/search/actions.ts` — `estimateEmbeddingBatch`, `runEmbeddingBatch`, `semanticSearchAction`, `saveEmbeddingKey`.
- Create: `app/reviews/[reviewId]/search/page.tsx` — página da busca (candidatos, lote, busca, estado da 2ª chave).
- Create: `app/reviews/[reviewId]/search/SemanticSearch.tsx` — UI client (consulta + resultados ancorados; sem chave → indisponível).

**Tests:**
- Create: `tests/unit/embedding/chunk.test.ts`
- Create: `tests/unit/embedding/mock-embedding.test.ts`
- Create: `tests/unit/embedding/voyage.test.ts`
- Create: `tests/integration/byok-purpose.test.ts`
- Create: `tests/integration/embedding-batch.test.ts`
- Create: `tests/integration/semantic-search.test.ts`
- Create: `tests/integration/rls.embedding-chunk.test.ts`

---

## Convenções de teste (lidas do repo, para o executor)

- Vitest. Testes de integração usam `tests/integration/helpers/supabase` → `signUpUser(email, pass)` (devolve `{ client }`, um client autenticado) e `serviceClient()` (service-role, bypassa RLS). Veja `tests/integration/extraction-batch.test.ts` como molde.
- Banco local: `npx supabase db reset` aplica `0001`–`0017`. Rodar **uma vez** após a Task 1.
- O `embedding` (vector) é inserido como **string** `"[v0,v1,...]"` (pgvector parseia o literal); a busca passa o vetor da query como `text` e a RPC faz `::vector`.
- Comandos: testes `npx vitest run <path>`; lint `npm run lint`; types `npx tsc --noEmit`.

---

### Task 1: Migration 0017 — pgvector + embedding_chunk + BYOK 2ª chave + RPCs

**Files:**
- Create: `supabase/migrations/0017_embedding_rag.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- Marco 2 / Fatia 6 — Busca semântica / RAG (US5 / FR-024..028).
-- Aditivo (não-regressão Marco ≥ 2), EXCETO a reparametrização do BYOK por
-- `purpose` (2ª chave — exceção justificada §7-B da slicing.md).
-- Vetores em pgvector; índice HNSW por DIMENSÃO FIXA do provedor ativo (1024).
-- ============================================================

-- pgvector
create extension if not exists vector;

-- ---------- BYOK: 2ª chave (purpose) ----------
-- llm_provider ganha 'voyage' (aditivo; usado só em runtime, não nesta transação).
alter type llm_provider add value if not exists 'voyage';

-- novo enum de finalidade da chave BYOK
do $$ begin
  if not exists (select 1 from pg_type where typname = 'byok_purpose') then
    create type byok_purpose as enum ('llm', 'embedding');
  end if;
end $$;

-- byok_key: troca a unicidade de (review_id) para (review_id, purpose).
alter table public.byok_key add column if not exists purpose byok_purpose not null default 'llm';
alter table public.byok_key drop constraint if exists byok_key_review_id_key;
create unique index if not exists byok_key_review_purpose_uidx
  on public.byok_key (review_id, purpose);

-- set_byok_key reparametrizado por purpose. Apaga só a chave do MESMO purpose
-- (não derruba a 1ª chave ao salvar a 2ª). Drop da assinatura antiga + nova com default.
drop function if exists public.set_byok_key(uuid, llm_provider, text);
create or replace function public.set_byok_key(
  p_review_id uuid,
  p_provider llm_provider,
  p_api_key text,
  p_purpose byok_purpose default 'llm'
)
returns public.byok_key
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_row public.byok_key;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  if coalesce(btrim(p_api_key), '') = '' then
    raise exception 'api key required';
  end if;

  delete from public.byok_key where review_id = p_review_id and purpose = p_purpose;

  v_secret_id := vault.create_secret(
    p_api_key,
    'byok:' || p_review_id::text || ':' || p_purpose::text || ':' || p_provider::text,
    'BYOK ' || p_purpose::text || ' key for review ' || p_review_id::text
  );

  insert into public.byok_key (review_id, provider, vault_secret_id, purpose)
  values (p_review_id, p_provider, v_secret_id, p_purpose)
  returning * into v_row;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'set_byok_key', 'byok_key', v_row.id,
          null, jsonb_build_object('provider', p_provider, 'purpose', p_purpose));

  return v_row;
end;
$$;

-- get_byok_secret reparametrizado por purpose. Drop da antiga + nova com default.
drop function if exists public.get_byok_secret(uuid);
create or replace function public.get_byok_secret(
  p_review_id uuid,
  p_purpose byok_purpose default 'llm'
)
returns table (provider llm_provider, api_key text)
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return query
  select k.provider, s.decrypted_secret
    from public.byok_key k
    join vault.decrypted_secrets s on s.id = k.vault_secret_id
   where k.review_id = p_review_id and k.purpose = p_purpose;
end;
$$;

grant execute on function public.set_byok_key(uuid, llm_provider, text, byok_purpose) to authenticated;
grant execute on function public.get_byok_secret(uuid, byok_purpose) to service_role;
revoke execute on function public.get_byok_secret(uuid, byok_purpose) from authenticated, anon, public;

-- ---------- job_type ganha embedding_batch (aditivo; runtime) ----------
alter type job_type add value if not exists 'embedding_batch';

-- ---------- embedding_chunk (US5 / D27/D28 / FR-024..026) ----------
-- DIMENSÃO: o índice HNSW abaixo é por DIMENSÃO FIXA do provedor ativo (Voyage
-- voyage-3 = 1024). A coluna guarda provider/model/dim para acomodar dimensão
-- VARIÁVEL no schema (A3/FR-026): trocar de provedor com outra dimensão é
-- operação de REINDEXAÇÃO/MIGRAÇÃO, não caminho quente da v1.
create table public.embedding_chunk (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  document_id uuid not null references public.document (id) on delete cascade,
  page int not null check (page >= 1),
  char_start int not null,
  char_end int not null,
  content text not null,
  origin text not null check (origin in ('nativo', 'ocr_ia')),
  embedding vector(1024) not null,
  provider text not null,
  model text not null,
  dim int not null,
  created_at timestamptz not null default now()
);

create index embedding_chunk_review_idx on public.embedding_chunk (review_id);
create index embedding_chunk_document_idx on public.embedding_chunk (document_id);
-- HNSW por dimensão fixa do provedor ativo (cosseno). Parâmetros afináveis (A2).
create index embedding_chunk_hnsw_idx on public.embedding_chunk
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

alter table public.embedding_chunk enable row level security;
create policy embedding_chunk_select on public.embedding_chunk
  for select using (public.is_review_member(review_id));
-- escrita só via service-role (worker); sem policy de insert para authenticated.

-- ---------- RPC: create_embedding_job (enqueue — FR-027) ----------
-- Espelha create_extraction_job (0016). Só ENFILEIRA; o worker Node embeda (§VIII).
-- Item = um documento processado AINDA NÃO embedado (idempotente — não re-embeda).
create or replace function public.create_embedding_job(
  p_review_id uuid,
  p_document_ids jsonb default null
)
returns public.job
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.job;
  v_count int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'embedding_batch', 'queued')
  returning * into v_job;

  insert into public.job_item (job_id, review_id, status, payload)
  select v_job.id, p_review_id, 'pending', jsonb_build_object('document_id', d.id)
  from public.document d
  where d.review_id = p_review_id
    and d.processing_status in ('text_ready', 'partial')
    and not exists (
      select 1 from public.embedding_chunk ec where ec.document_id = d.id
    )
    and (
      p_document_ids is null
      or d.id::text in (select jsonb_array_elements_text(p_document_ids))
    );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'enqueue_embedding_batch', 'job', v_job.id,
          null, jsonb_build_object('item_count', v_count));

  return v_job;
end;
$$;

grant execute on function public.create_embedding_job(uuid, jsonb) to authenticated;

-- ---------- RPC: match_embedding_chunks (busca — FR-024/FR-025) ----------
-- security definer + checagem de membro + filtro review_id explícito (SC-008/011).
-- p_query é o vetor da consulta serializado como texto ('[...]'); cast p/ vector.
create or replace function public.match_embedding_chunks(
  p_review_id uuid,
  p_query text,
  p_k int default 10
)
returns table (
  document_id uuid,
  record_id uuid,
  page int,
  source_span text,
  origin text,
  similarity double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  return query
  select ec.document_id, d.record_id, ec.page, ec.content as source_span, ec.origin,
         1 - (ec.embedding <=> p_query::vector) as similarity
    from public.embedding_chunk ec
    join public.document d on d.id = ec.document_id
   where ec.review_id = p_review_id
   order by ec.embedding <=> p_query::vector
   limit p_k;
end;
$$;

grant execute on function public.match_embedding_chunks(uuid, text, int) to authenticated;
```

- [ ] **Step 2: Aplicar e verificar a migration**

Run: `npx supabase db reset`
Expected: aplica `0001`–`0017` sem erro; saída inclui `0017_embedding_rag.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_embedding_rag.sql
git commit -m "feat(002-f6): migration 0017 pgvector + embedding_chunk + HNSW + BYOK purpose + RPCs (US5/FR-024..028)"
```

---

### Task 2: Regenerar `src/types/database.ts`

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Regenerar os tipos a partir do schema local**

Run: `npx supabase gen types typescript --local > src/types/database.ts`
Expected: o arquivo passa a conter `embedding_chunk`, `byok_key.purpose`, `embedding_batch` em `job_type`, e as funções `create_embedding_job`/`match_embedding_chunks`.

- [ ] **Step 2: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros (nenhum consumidor ainda usa os tipos novos; a regeneração não quebra nada existente).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "chore(002-f6): regenera database.ts (embedding_chunk, byok purpose, embedding_batch)"
```

---

### Task 3: `EmbeddingProvider` — tipos e erro

**Files:**
- Create: `src/lib/ai/embedding/types.ts`

- [ ] **Step 1: Escrever os tipos do contrato** (de `contracts/embedding-provider.md`)

```ts
// src/lib/ai/embedding/types.ts
export interface EmbeddingIdentity {
  provider: "voyage" | string; // default: voyage (D28)
  model: string; // ex.: 'voyage-3'
  dimension: number; // ex.: 1024 — define a dim do vetor (R5)
}

export interface Chunk {
  document_id: string;
  page: number;
  char_start: number;
  char_end: number;
  origin: "nativo" | "ocr_ia";
  content: string;
}

export interface EmbeddedChunk extends Chunk {
  embedding: number[]; // length === identity().dimension
}

export interface SemanticHit {
  document_id: string;
  record_id: string; // estudo de origem (FR-024)
  page: number;
  source_span: string; // trecho ancorado, idioma original
  origin: "nativo" | "ocr_ia";
  similarity: number; // 0..1 (cosseno)
}

export interface EmbeddingCostEstimate {
  tokensEstimated: number;
  cost: Record<string, number>;
}

export interface EmbeddingProvider {
  identity(): EmbeddingIdentity;
  /** Gera vetores para chunks (R6). Chamado pelo worker do job embedding_batch (§VIII). */
  embed(input: { chunks: Chunk[] }): Promise<EmbeddedChunk[]>;
  /** Embedding de 1 query para busca (FR-024). */
  embedQuery(input: { query: string }): Promise<number[]>;
  /** Estimativa de custo antes do lote (FR-022/R9). */
  estimateCost(input: { chunkCount: number }): Promise<EmbeddingCostEstimate>;
}

/** Lançado quando a 2ª chave BYOK (embedding) não está cadastrada (FR-028). */
export class MissingEmbeddingKeyError extends Error {
  constructor(reviewId: string) {
    super(`Nenhuma chave de embeddings cadastrada para a Revisão ${reviewId}`);
    this.name = "MissingEmbeddingKeyError";
  }
}
```

- [ ] **Step 2: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/embedding/types.ts
git commit -m "feat(002-f6): EmbeddingProvider tipos + MissingEmbeddingKeyError (contrato US5)"
```

---

### Task 4: `MockEmbeddingProvider` (determinístico)

**Files:**
- Create: `src/lib/ai/embedding/mock.ts`
- Test: `tests/unit/embedding/mock-embedding.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/unit/embedding/mock-embedding.test.ts
import { describe, it, expect } from "vitest";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";

describe("MockEmbeddingProvider", () => {
  const p = new MockEmbeddingProvider();

  it("identity expõe provider/model/dimension", () => {
    expect(p.identity()).toEqual({
      provider: "mock",
      model: "mock-embed",
      dimension: 1024,
    });
  });

  it("embed retorna um vetor de length === dimension para cada chunk", async () => {
    const out = await p.embed({
      chunks: [
        {
          document_id: "d1",
          page: 1,
          char_start: 0,
          char_end: 5,
          origin: "nativo",
          content: "alpha",
        },
        {
          document_id: "d1",
          page: 2,
          char_start: 5,
          char_end: 9,
          origin: "nativo",
          content: "beta",
        },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].embedding).toHaveLength(1024);
    expect(out[1].embedding).toHaveLength(1024);
    expect(out[0].content).toBe("alpha");
  });

  it("é determinístico: o mesmo texto gera o mesmo vetor", async () => {
    const q1 = await p.embedQuery({ query: "amostra de participantes" });
    const q2 = await p.embedQuery({ query: "amostra de participantes" });
    expect(q1).toEqual(q2);
    expect(q1).toHaveLength(1024);
  });

  it("estimateCost cresce com chunkCount", async () => {
    const a = await p.estimateCost({ chunkCount: 10 });
    const b = await p.estimateCost({ chunkCount: 20 });
    expect(b.tokensEstimated).toBeGreaterThan(a.tokensEstimated);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/unit/embedding/mock-embedding.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/embedding/mock'`.

- [ ] **Step 3: Implementar o mock**

```ts
// src/lib/ai/embedding/mock.ts
import type {
  Chunk,
  EmbeddedChunk,
  EmbeddingCostEstimate,
  EmbeddingIdentity,
  EmbeddingProvider,
} from "./types";

const DIM = 1024;

/** Vetor determinístico a partir do texto: hash dos char codes espalhado em DIM
 *  posições, depois normalizado (norma L2 = 1) para cosseno estável. Sem rede. */
function deterministicVector(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    v[(code + i) % DIM] += ((code % 17) + 1) / 17;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Provider determinístico para testes e modo sem-chave em dev. */
export class MockEmbeddingProvider implements EmbeddingProvider {
  identity(): EmbeddingIdentity {
    return { provider: "mock", model: "mock-embed", dimension: DIM };
  }

  async embed(input: { chunks: Chunk[] }): Promise<EmbeddedChunk[]> {
    return input.chunks.map((c) => ({
      ...c,
      embedding: deterministicVector(c.content),
    }));
  }

  async embedQuery(input: { query: string }): Promise<number[]> {
    return deterministicVector(input.query);
  }

  async estimateCost(input: {
    chunkCount: number;
  }): Promise<EmbeddingCostEstimate> {
    const tokensEstimated = input.chunkCount * 512;
    return { tokensEstimated, cost: { usd: (tokensEstimated / 1000) * 0.00012 } };
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar verde**

Run: `npx vitest run tests/unit/embedding/mock-embedding.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/embedding/mock.ts tests/unit/embedding/mock-embedding.test.ts
git commit -m "feat(002-f6): MockEmbeddingProvider determinístico (vetor 1024 normalizado)"
```

---

### Task 5: `VoyageProvider` (adapter `fetch` — D-F6.1)

**Files:**
- Create: `src/lib/ai/embedding/voyage.ts`
- Test: `tests/unit/embedding/voyage.test.ts`

- [ ] **Step 1: Escrever o teste que falha** (mocka `fetch`; valida shape da request e parsing)

```ts
// tests/unit/embedding/voyage.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { VoyageProvider } from "@/lib/ai/embedding/voyage";

afterEach(() => vi.restoreAllMocks());

function mockFetchOnce(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

describe("VoyageProvider", () => {
  it("identity expõe voyage-3 / 1024", () => {
    const p = new VoyageProvider("key");
    expect(p.identity()).toEqual({
      provider: "voyage",
      model: "voyage-3",
      dimension: 1024,
    });
  });

  it("embed chama a API com input_type='document' e devolve vetores na ordem", async () => {
    const spy = mockFetchOnce({
      data: [
        { index: 0, embedding: new Array(1024).fill(0.1) },
        { index: 1, embedding: new Array(1024).fill(0.2) },
      ],
      usage: { total_tokens: 10 },
    });
    const p = new VoyageProvider("secret-key");
    const out = await p.embed({
      chunks: [
        { document_id: "d", page: 1, char_start: 0, char_end: 1, origin: "nativo", content: "a" },
        { document_id: "d", page: 1, char_start: 1, char_end: 2, origin: "nativo", content: "b" },
      ],
    });
    expect(out[0].embedding).toHaveLength(1024);
    expect(out[1].embedding[0]).toBeCloseTo(0.2);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.model).toBe("voyage-3");
    expect(sent.input_type).toBe("document");
    expect(sent.input).toEqual(["a", "b"]);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret-key",
    });
  });

  it("embedQuery usa input_type='query' e devolve 1 vetor", async () => {
    mockFetchOnce({ data: [{ index: 0, embedding: new Array(1024).fill(0.3) }], usage: {} });
    const p = new VoyageProvider("k");
    const v = await p.embedQuery({ query: "consulta" });
    expect(v).toHaveLength(1024);
  });

  it("erro da API vira exceção tratável", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as Response);
    const p = new VoyageProvider("bad");
    await expect(
      p.embed({
        chunks: [
          { document_id: "d", page: 1, char_start: 0, char_end: 1, origin: "nativo", content: "a" },
        ],
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/unit/embedding/voyage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/embedding/voyage'`.

- [ ] **Step 3: Implementar o adapter**

```ts
// src/lib/ai/embedding/voyage.ts
import type {
  Chunk,
  EmbeddedChunk,
  EmbeddingCostEstimate,
  EmbeddingIdentity,
  EmbeddingProvider,
} from "./types";

const MODEL = "voyage-3"; // default D28/R4 (multilingue)
const DIMENSION = 1024; // R5
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: { index: number; embedding: number[] }[];
  usage?: { total_tokens?: number };
}

export class VoyageProvider implements EmbeddingProvider {
  constructor(private apiKey: string) {}

  identity(): EmbeddingIdentity {
    return { provider: "voyage", model: MODEL, dimension: DIMENSION };
  }

  private async call(
    inputs: string[],
    inputType: "document" | "query",
  ): Promise<number[][]> {
    if (inputs.length === 0) return [];
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: inputs,
        input_type: inputType,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Voyage API ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as VoyageResponse;
    // ordena por index para casar com a ordem dos inputs.
    return [...json.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }

  async embed(input: { chunks: Chunk[] }): Promise<EmbeddedChunk[]> {
    const vectors = await this.call(
      input.chunks.map((c) => c.content),
      "document",
    );
    return input.chunks.map((c, i) => ({ ...c, embedding: vectors[i] }));
  }

  async embedQuery(input: { query: string }): Promise<number[]> {
    const [v] = await this.call([input.query], "query");
    return v;
  }

  async estimateCost(input: {
    chunkCount: number;
  }): Promise<EmbeddingCostEstimate> {
    const tokensEstimated = input.chunkCount * 512; // ~512 tokens/chunk (R6)
    return { tokensEstimated, cost: { usd: (tokensEstimated / 1000) * 0.00012 } };
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar verde**

Run: `npx vitest run tests/unit/embedding/voyage.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/embedding/voyage.ts tests/unit/embedding/voyage.test.ts
git commit -m "feat(002-f6): VoyageProvider adapter fetch (voyage-3/1024, input_type doc|query)"
```

---

### Task 6: BYOK 2ª chave — parametrizar por `purpose` (toca código herdado)

**Files:**
- Modify: `src/lib/byok/queries.ts`
- Modify: `src/lib/byok/actions.ts`
- Modify: `src/lib/ai/llm/index.ts`
- Test: `tests/integration/byok-purpose.test.ts`

- [ ] **Step 1: Escrever o teste de integração que falha** (1ª e 2ª chave coexistem, distintas)

```ts
// tests/integration/byok-purpose.test.ts
import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

async function newReview() {
  const { client } = await signUpUser(
    `byok_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review } = await client.rpc("create_review", {
    p_title: "BYOK purpose",
  });
  return { client, reviewId: review!.id as string };
}

describe("BYOK 2ª chave por purpose (FR-028)", () => {
  it("salva chave llm e embedding na mesma Revisão sem uma derrubar a outra", async () => {
    const { client, reviewId } = await newReview();
    await client.rpc("set_byok_key", {
      p_review_id: reviewId,
      p_provider: "anthropic",
      p_api_key: "sk-llm",
      p_purpose: "llm",
    });
    await client.rpc("set_byok_key", {
      p_review_id: reviewId,
      p_provider: "voyage",
      p_api_key: "pa-embed",
      p_purpose: "embedding",
    });

    const { data: rows } = await client
      .from("byok_key")
      .select("purpose, provider")
      .eq("review_id", reviewId);
    expect((rows ?? []).length).toBe(2);

    const svc = serviceClient();
    const { data: llm } = await svc.rpc("get_byok_secret", {
      p_review_id: reviewId,
      p_purpose: "llm",
    });
    const { data: emb } = await svc.rpc("get_byok_secret", {
      p_review_id: reviewId,
      p_purpose: "embedding",
    });
    expect(llm![0].api_key).toBe("sk-llm");
    expect(llm![0].provider).toBe("anthropic");
    expect(emb![0].api_key).toBe("pa-embed");
    expect(emb![0].provider).toBe("voyage");
  });

  it("get_byok_secret default resolve a chave llm", async () => {
    const { client, reviewId } = await newReview();
    await client.rpc("set_byok_key", {
      p_review_id: reviewId,
      p_provider: "anthropic",
      p_api_key: "sk-only",
      p_purpose: "llm",
    });
    const svc = serviceClient();
    const { data } = await svc.rpc("get_byok_secret", { p_review_id: reviewId });
    expect(data![0].api_key).toBe("sk-only");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar verde da RPC**

Run: `npx vitest run tests/integration/byok-purpose.test.ts`
Expected: PASS (2 testes) — o SQL da Task 1 já cobre. Se a função antiga estiver em cache local, rode `npx supabase db reset`. **Este passo valida o SQL; o código TS abaixo é a parte da fatia que falta para os consumidores.**

- [ ] **Step 3: Atualizar `getByokStatus` para aceitar `purpose`**

```ts
// src/lib/byok/queries.ts
import { createClient } from "@/lib/supabase/server";

export type ByokPurpose = "llm" | "embedding";

export interface ByokStatus {
  present: boolean;
  provider: string | null;
}

export async function getByokStatus(
  reviewId: string,
  purpose: ByokPurpose = "llm",
): Promise<ByokStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("byok_key")
    .select("provider")
    .eq("review_id", reviewId)
    .eq("purpose", purpose)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { present: !!data, provider: data?.provider ?? null };
}
```

- [ ] **Step 4: Atualizar `saveByokKey` para aceitar `purpose`/`provider`**

```ts
// src/lib/byok/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ByokPurpose } from "./queries";

export async function saveByokKey(
  reviewId: string,
  formData: FormData,
  opts: { purpose?: ByokPurpose; provider?: string } = {},
) {
  const purpose: ByokPurpose = opts.purpose ?? "llm";
  const provider = opts.provider ?? "anthropic";
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey === "") {
    return { ok: false, error: "Informe a chave do provedor." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_byok_key", {
    p_review_id: reviewId,
    p_provider: provider,
    p_api_key: apiKey,
    p_purpose: purpose,
  });
  if (error) return { ok: false, error: "Falha ao salvar a chave." };
  revalidatePath(
    `/reviews/${reviewId}/${purpose === "embedding" ? "search" : "question"}`,
  );
  return { ok: true as const };
}
```

- [ ] **Step 5: `getLLMProvider` passa `p_purpose: 'llm'` explícito**

```ts
// src/lib/ai/llm/index.ts — alterar APENAS a chamada da RPC:
  const { data, error } = await admin.rpc("get_byok_secret", {
    p_review_id: reviewId,
    p_purpose: "llm",
  });
```

- [ ] **Step 6: Rodar o teste + type-check** (confirma que os consumidores herdados não quebram)

Run: `npx vitest run tests/integration/byok-purpose.test.ts && npx tsc --noEmit`
Expected: PASS (2 testes) e 0 erros de tipo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/byok/queries.ts src/lib/byok/actions.ts src/lib/ai/llm/index.ts tests/integration/byok-purpose.test.ts
git commit -m "feat(002-f6): BYOK 2ª chave por purpose (set/get/status parametrizados) (US5/FR-028)"
```

---

### Task 7: `getEmbeddingProvider` (resolve a 2ª chave)

**Files:**
- Create: `src/lib/ai/embedding/index.ts`

- [ ] **Step 1: Implementar o resolver** (espelha `getLLMProvider`)

```ts
// src/lib/ai/embedding/index.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { VoyageProvider } from "./voyage";
import { MissingEmbeddingKeyError, type EmbeddingProvider } from "./types";

export type { EmbeddingProvider } from "./types";
export { MissingEmbeddingKeyError } from "./types";

/**
 * Resolve o provider de EMBEDDINGS (2ª chave BYOK, purpose='embedding'). Decifra
 * server-side via service-role. O chamador DEVE ter verificado a associação à
 * Revisão. Sem chave ⇒ MissingEmbeddingKeyError (FR-028).
 */
export async function getEmbeddingProvider(
  reviewId: string,
): Promise<EmbeddingProvider> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_byok_secret", {
    p_review_id: reviewId,
    p_purpose: "embedding",
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row?.api_key) throw new MissingEmbeddingKeyError(reviewId);
  if (row.provider === "voyage") return new VoyageProvider(row.api_key);
  throw new Error(`Provider de embeddings não suportado: ${row.provider}`);
}
```

- [ ] **Step 2: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/embedding/index.ts
git commit -m "feat(002-f6): getEmbeddingProvider resolve 2ª chave BYOK (Voyage server-side)"
```

---

### Task 8: Chunking ancorado a página/posição (R6)

**Files:**
- Create: `src/lib/embedding/chunk.ts`
- Test: `tests/unit/embedding/chunk.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/unit/embedding/chunk.test.ts
import { describe, it, expect } from "vitest";
import { chunkLayers } from "@/lib/embedding/chunk";

const layer = (page: number, content: string, origin: "nativo" | "ocr_ia" = "nativo") => ({
  document_id: "d1",
  page,
  char_start: 0,
  char_end: content.length,
  content,
  origin,
});

describe("chunkLayers (R6 — ancorado a página/posição)", () => {
  it("uma camada curta vira um único chunk com âncora da página", () => {
    const chunks = chunkLayers([layer(1, "Amostra de 42 participantes.")], {
      maxChars: 100,
      overlapChars: 10,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      document_id: "d1",
      page: 1,
      origin: "nativo",
      content: "Amostra de 42 participantes.",
      char_start: 0,
    });
  });

  it("camada longa é dividida em janelas com overlap, preservando a página", () => {
    const text = "a".repeat(250);
    const chunks = chunkLayers([layer(3, text)], { maxChars: 100, overlapChars: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.page === 3)).toBe(true);
    expect(chunks.every((c) => c.content.length <= 100)).toBe(true);
    // overlap: o 2º chunk começa antes do fim do 1º.
    expect(chunks[1].char_start).toBeLessThan(chunks[0].char_end);
  });

  it("cada página gera chunks independentes e herda a origin", () => {
    const chunks = chunkLayers(
      [layer(1, "pagina um"), layer(2, "pagina dois", "ocr_ia")],
      { maxChars: 100, overlapChars: 10 },
    );
    const pages = chunks.map((c) => c.page).sort();
    expect(pages).toEqual([1, 2]);
    expect(chunks.find((c) => c.page === 2)!.origin).toBe("ocr_ia");
  });

  it("ignora camadas vazias", () => {
    expect(chunkLayers([layer(1, "   ")], { maxChars: 100, overlapChars: 10 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/unit/embedding/chunk.test.ts`
Expected: FAIL — `Cannot find module '@/lib/embedding/chunk'`.

- [ ] **Step 3: Implementar o chunking**

```ts
// src/lib/embedding/chunk.ts
import type { Chunk } from "@/lib/ai/embedding/types";

export interface LayerInput {
  document_id: string;
  page: number;
  char_start: number;
  char_end: number;
  content: string;
  origin: "nativo" | "ocr_ia";
}

export interface ChunkOptions {
  maxChars: number; // ~512 tokens ≈ 2048 chars; default abaixo é conservador
  overlapChars: number; // ~15% overlap (R6)
}

const DEFAULTS: ChunkOptions = { maxChars: 2000, overlapChars: 300 };

/**
 * Divide cada text_layer em janelas de caracteres com overlap, mantendo a ÂNCORA
 * (document_id, page, char_start/char_end relativos ao texto da página) e a origin
 * (R6/FR-024). Por página: o chunk é verificável contra o PDF. Camadas vazias são
 * descartadas. char_start/char_end são posições DENTRO do content da camada.
 */
export function chunkLayers(
  layers: LayerInput[],
  options: ChunkOptions = DEFAULTS,
): Chunk[] {
  const { maxChars, overlapChars } = options;
  const step = Math.max(1, maxChars - overlapChars);
  const out: Chunk[] = [];

  for (const l of layers) {
    const text = l.content;
    if (text.trim().length === 0) continue;
    if (text.length <= maxChars) {
      out.push({
        document_id: l.document_id,
        page: l.page,
        char_start: 0,
        char_end: text.length,
        origin: l.origin,
        content: text,
      });
      continue;
    }
    for (let start = 0; start < text.length; start += step) {
      const end = Math.min(start + maxChars, text.length);
      out.push({
        document_id: l.document_id,
        page: l.page,
        char_start: start,
        char_end: end,
        origin: l.origin,
        content: text.slice(start, end),
      });
      if (end === text.length) break;
    }
  }
  return out;
}
```

- [ ] **Step 4: Rodar o teste e confirmar verde**

Run: `npx vitest run tests/unit/embedding/chunk.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/embedding/chunk.ts tests/unit/embedding/chunk.test.ts
git commit -m "feat(002-f6): chunking ancorado a página/posição com overlap (R6)"
```

---

### Task 9: `enqueueEmbeddingJob` + `listEmbeddingCandidates`

**Files:**
- Create: `src/lib/embedding/enqueue.ts`
- Create: `src/lib/embedding/queries.ts`
- Test: `tests/integration/embedding-batch.test.ts` (parte enqueue/candidates)

- [ ] **Step 1: Escrever o teste que falha** (helper de seed reusado pelas Tasks 9–13; exporte-os)

```ts
// tests/integration/embedding-batch.test.ts
import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueEmbeddingJob } from "@/lib/embedding/enqueue";
import { listEmbeddingCandidates } from "@/lib/embedding/queries";
import { processEmbeddingJob } from "@/lib/embedding/batch-worker";
import { runEmbeddingBatchWorkerWith } from "@/lib/embedding/batch-run";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";

/** Estudo included_ft + 1 document processado + N text_layer. Devolve {recordId, documentId}. */
export async function seedDoc(
  svc: SupabaseClient,
  reviewId: string,
  opts: { processed?: boolean; pages?: string[] } = {},
): Promise<{ recordId: string; documentId: string | null }> {
  const { data: rec } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      corpus_state: "included_ft",
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo" },
    })
    .select("id")
    .single();
  const recordId = rec!.id as string;
  if (opts.processed === false) return { recordId, documentId: null };
  const { data: doc } = await svc
    .from("document")
    .insert({
      review_id: reviewId,
      record_id: recordId,
      storage_path: `review/${reviewId}/record/${recordId}/d.pdf`,
      filename: "d.pdf",
      byte_size: 10,
      processing_status: "text_ready",
    })
    .select("id")
    .single();
  const documentId = doc!.id as string;
  const pages = opts.pages ?? ["Amostra de 42 participantes."];
  let i = 0;
  for (const content of pages) {
    i += 1;
    await svc.from("text_layer").insert({
      review_id: reviewId,
      document_id: documentId,
      page: i,
      char_start: 0,
      char_end: content.length,
      content,
      origin: "nativo",
    });
  }
  return { recordId, documentId };
}

export async function setupReview() {
  const { client } = await signUpUser(
    `emb_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review } = await client.rpc("create_review", {
    p_title: "Embeddings",
  });
  return { client, reviewId: review!.id as string, svc: serviceClient() };
}

describe("enqueueEmbeddingJob + listEmbeddingCandidates (US5/FR-027)", () => {
  it("enfileira um job_item por documento processado e não-embedado", async () => {
    const { client, reviewId, svc } = await setupReview();
    const a = await seedDoc(svc, reviewId);
    await seedDoc(svc, reviewId, { processed: false }); // sem PDF processado → fora

    const candidates = await listEmbeddingCandidates({ supabase: client }, reviewId);
    expect(candidates.map((c) => c.document_id)).toEqual([a.documentId]);

    const res = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    expect(res.status).toBe("queued");
    expect(res.item_count).toBe(1);

    const { data: job } = await svc
      .from("job")
      .select("type, status")
      .eq("id", res.job_id)
      .single();
    expect(job!.type).toBe("embedding_batch");
  });
});

describe("processEmbeddingJob (US5/FR-026/FR-027)", () => {
  it("embeda cada documento, grava embedding_chunk + ai_usage(phase='embedding') e fecha o job", async () => {
    const { client, reviewId, svc } = await setupReview();
    await seedDoc(svc, reviewId, { pages: ["pagina um do estudo", "pagina dois do estudo"] });
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);

    const res = await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed");
    expect(res.done).toBe(1);

    const { data: chunks } = await svc
      .from("embedding_chunk")
      .select("page, content, dim, provider")
      .eq("review_id", reviewId);
    expect((chunks ?? []).length).toBeGreaterThanOrEqual(2);
    expect((chunks ?? []).every((c) => c.dim === 1024)).toBe(true);
    expect((chunks ?? []).every((c) => c.provider === "mock")).toBe(true);

    const { data: usage } = await svc
      .from("ai_usage")
      .select("phase, job_id")
      .eq("review_id", reviewId)
      .eq("phase", "embedding");
    expect((usage ?? []).length).toBe(1);
    expect((usage ?? [])[0]!.job_id).toBe(enq.job_id);
  });

  it("falha em um item não derruba o lote (completed_with_errors)", async () => {
    const { client, reviewId, svc } = await setupReview();
    await seedDoc(svc, reviewId);
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    await svc.from("job_item").insert({
      job_id: enq.job_id,
      review_id: reviewId,
      status: "pending",
      payload: { document_id: "00000000-0000-0000-0000-000000000000" },
    });

    const res = await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed_with_errors");
    expect(res.done).toBe(1);
    expect(res.failed).toBe(1);
  });

  it("é retomável: re-rodar não duplica chunks de itens já 'done'", async () => {
    const { client, reviewId, svc } = await setupReview();
    await seedDoc(svc, reviewId);
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    await processEmbeddingJob({ supabase: svc, provider: new MockEmbeddingProvider() }, enq.job_id);
    const { count: after1 } = await svc
      .from("embedding_chunk")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    const res2 = await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );
    expect(res2.done).toBe(0);
    const { count: after2 } = await svc
      .from("embedding_chunk")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(after2).toBe(after1);
  });
});

describe("runEmbeddingBatchWorkerWith (US5/A1)", () => {
  it("processa todos os jobs embedding_batch ativos da Revisão", async () => {
    const { client, reviewId, svc } = await setupReview();
    await seedDoc(svc, reviewId);
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    await runEmbeddingBatchWorkerWith(svc, new MockEmbeddingProvider(), reviewId);
    const { data: job } = await svc
      .from("job")
      .select("status")
      .eq("id", enq.job_id)
      .single();
    expect(job!.status).toBe("completed");
  });
});
```

> Os describes de `processEmbeddingJob` e `runEmbeddingBatchWorkerWith` ficam vermelhos até as Tasks 10 e 11. Nesta Task, rode só o describe de enqueue (Step 4).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/integration/embedding-batch.test.ts -t "enqueueEmbeddingJob"`
Expected: FAIL — `Cannot find module '@/lib/embedding/enqueue'`.

- [ ] **Step 3: Implementar `queries.ts` e `enqueue.ts`**

```ts
// src/lib/embedding/queries.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EmbeddingCandidate {
  document_id: string;
  record_id: string;
  filename: string;
}

/**
 * Documentos elegíveis para embeddings (US5): processados (text_ready/partial) e
 * AINDA NÃO embedados. Mesmo predicado da RPC create_embedding_job — manter em
 * sincronia. Um documento com chunks já gerados não reaparece (idempotência).
 */
export async function listEmbeddingCandidates(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<EmbeddingCandidate[]> {
  const { data, error } = await deps.supabase
    .from("document")
    .select("id, record_id, filename, embedding_chunk(id)")
    .eq("review_id", reviewId)
    .in("processing_status", ["text_ready", "partial"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as Array<{
      id: string;
      record_id: string;
      filename: string;
      embedding_chunk: { id: string }[];
    }>
  )
    .filter((d) => (d.embedding_chunk ?? []).length === 0)
    .map((d) => ({ document_id: d.id, record_id: d.record_id, filename: d.filename }));
}
```

```ts
// src/lib/embedding/enqueue.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EmbeddingEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/**
 * Cria o job embedding_batch (via RPC create_embedding_job) e conta os job_item.
 * NÃO embeda (§VIII) — o worker server-side (batch-worker.ts) faz o trabalho.
 * Espelha enqueueExtractionJob. documentIds: subconjunto opcional.
 */
export async function enqueueEmbeddingJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  documentIds: string[] | null,
): Promise<EmbeddingEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc("create_embedding_job", {
    p_review_id: reviewId,
    p_document_ids: documentIds ?? null,
  });
  if (error) throw new Error(error.message);

  const { count, error: countErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  if (countErr) throw new Error(countErr.message);

  return { job_id: job.id, status: "queued", item_count: count ?? 0 };
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npx vitest run tests/integration/embedding-batch.test.ts -t "enqueueEmbeddingJob"`
Expected: PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add src/lib/embedding/queries.ts src/lib/embedding/enqueue.ts tests/integration/embedding-batch.test.ts
git commit -m "feat(002-f6): enqueueEmbeddingJob + listEmbeddingCandidates (US5/FR-027)"
```

---

### Task 10: `processEmbeddingJob` (worker por documento, resiliente)

**Files:**
- Create: `src/lib/embedding/batch-worker.ts`

- [ ] **Step 1: Confirmar os testes vermelhos** (já escritos na Task 9, Step 1)

Run: `npx vitest run tests/integration/embedding-batch.test.ts -t "processEmbeddingJob"`
Expected: FAIL — `Cannot find module '@/lib/embedding/batch-worker'`.

- [ ] **Step 2: Implementar o worker** (espelha `processExtractionJob` da Fatia 5)

```ts
// src/lib/embedding/batch-worker.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddingProvider } from "@/lib/ai/embedding/types";
import { chunkLayers, type LayerInput } from "./chunk";

interface EmbeddingItem {
  id: string;
  payload: { document_id: string };
  review_id: string;
  attempts: number;
}

export interface EmbeddingBatchDeps {
  supabase: SupabaseClient; // service-role — escrita da IA bypassa RLS
  provider: EmbeddingProvider;
}

export interface EmbeddingBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/** Embeda um documento: lê text_layer → chunka → embed → insere embedding_chunk. */
async function embedDocument(
  deps: EmbeddingBatchDeps,
  reviewId: string,
  documentId: string,
): Promise<number> {
  const { supabase, provider } = deps;
  const { data: layers, error } = await supabase
    .from("text_layer")
    .select("document_id, page, char_start, char_end, content, origin")
    .eq("document_id", documentId)
    .order("page", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (layers ?? []) as LayerInput[];
  if (rows.length === 0) {
    throw new Error(`documento ${documentId} sem text_layer`);
  }

  const chunks = chunkLayers(rows);
  if (chunks.length === 0) return 0;

  const embedded = await provider.embed({ chunks });
  const id = provider.identity();
  const insertRows = embedded.map((e) => ({
    review_id: reviewId,
    document_id: documentId,
    page: e.page,
    char_start: e.char_start,
    char_end: e.char_end,
    content: e.content,
    origin: e.origin,
    embedding: `[${e.embedding.join(",")}]`, // literal pgvector
    provider: id.provider,
    model: id.model,
    dim: id.dimension,
  }));
  const { error: insErr } = await supabase
    .from("embedding_chunk")
    .insert(insertRows);
  if (insErr) throw new Error(insErr.message);
  return insertRows.length;
}

/**
 * Processa um job embedding_batch item-a-item (§VIII / A1): cada item é UM
 * documento. Falha de um item ⇒ item 'failed' (não derruba o job — FR-027).
 * Retomável: só pega itens 'pending'. Espelha processExtractionJob (Fatia 5).
 */
export async function processEmbeddingJob(
  deps: EmbeddingBatchDeps,
  jobId: string,
): Promise<EmbeddingBatchResult> {
  const { supabase } = deps;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: items, error } = await supabase
    .from("job_item")
    .select("id, payload, review_id, attempts")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  let runDone = 0;
  let runFailed = 0;

  for (const it of (items ?? []) as EmbeddingItem[]) {
    try {
      await embedDocument(deps, it.review_id, it.payload.document_id);
      await supabase.from("ai_usage").insert({
        review_id: it.review_id,
        phase: "embedding",
        tokens_in: 0,
        tokens_out: 0,
        cost: {},
        job_id: jobId,
      });
      await supabase.from("job_item").update({ status: "done" }).eq("id", it.id);
      runDone++;
    } catch (e) {
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: (it.attempts ?? 0) + 1,
        })
        .eq("id", it.id);
      runFailed++;
    }
  }

  const { data: counts, error: cErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);
  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const totalDone = all.filter((i) => i.status === "done").length;
  const totalFailed = all.filter((i) => i.status === "failed").length;
  const status =
    totalFailed > 0
      ? totalDone > 0
        ? "completed_with_errors"
        : "failed"
      : "completed";

  await supabase
    .from("job")
    .update({
      status,
      progress: total ? Math.round((totalDone / total) * 100) : 100,
    })
    .eq("id", jobId);

  return { job_id: jobId, status, done: runDone, failed: runFailed };
}
```

- [ ] **Step 3: Rodar e confirmar verde**

Run: `npx vitest run tests/integration/embedding-batch.test.ts -t "processEmbeddingJob"`
Expected: PASS (3 testes).

- [ ] **Step 4: Commit**

```bash
git add src/lib/embedding/batch-worker.ts
git commit -m "feat(002-f6): processEmbeddingJob por documento, resiliente/retomável + ai_usage (US5/FR-026/FR-027)"
```

---

### Task 11: `runEmbeddingBatchWorkerWith`

**Files:**
- Create: `src/lib/embedding/batch-run.ts`

- [ ] **Step 1: Confirmar o teste vermelho** (já escrito na Task 9, Step 1)

Run: `npx vitest run tests/integration/embedding-batch.test.ts -t "runEmbeddingBatchWorkerWith"`
Expected: FAIL — `Cannot find module '@/lib/embedding/batch-run'`.

- [ ] **Step 2: Implementar** (espelha `runExtractionBatchWorkerWith`)

```ts
// src/lib/embedding/batch-run.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddingProvider } from "@/lib/ai/embedding/types";
import { processEmbeddingJob } from "./batch-worker";

/**
 * Processa todos os jobs embedding_batch ativos da Revisão. Recebe o client
 * (admin/service em produção) e o provider já resolvidos — testável e desacoplado
 * da resolução de BYOK. Espelha runExtractionBatchWorkerWith.
 */
export async function runEmbeddingBatchWorkerWith(
  supabase: SupabaseClient,
  provider: EmbeddingProvider,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "embedding_batch")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processEmbeddingJob({ supabase, provider }, j.id);
  }
}
```

- [ ] **Step 3: Rodar e confirmar verde** (o arquivo inteiro deve passar)

Run: `npx vitest run tests/integration/embedding-batch.test.ts`
Expected: PASS (todos os describes do arquivo).

- [ ] **Step 4: Commit**

```bash
git add src/lib/embedding/batch-run.ts
git commit -m "feat(002-f6): runEmbeddingBatchWorkerWith processa jobs ativos (US5/A1)"
```

---

### Task 12: `semanticSearch` (busca via RPC, ancorada)

**Files:**
- Create: `src/lib/embedding/search.ts`
- Test: `tests/integration/semantic-search.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/integration/semantic-search.test.ts
import { describe, it, expect } from "vitest";
import { setupReview, seedDoc } from "./embedding-batch.test";
import { enqueueEmbeddingJob } from "@/lib/embedding/enqueue";
import { processEmbeddingJob } from "@/lib/embedding/batch-worker";
import { semanticSearch } from "@/lib/embedding/search";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";

describe("semanticSearch (US5/FR-024)", () => {
  it("retorna trechos ancorados (page + source_span + estudo)", async () => {
    const { client, reviewId, svc } = await setupReview();
    const { recordId } = await seedDoc(svc, reviewId, {
      pages: ["Amostra de 42 participantes adultos."],
    });
    const enq = await enqueueEmbeddingJob({ supabase: client }, reviewId, null);
    await processEmbeddingJob(
      { supabase: svc, provider: new MockEmbeddingProvider() },
      enq.job_id,
    );

    const hits = await semanticSearch(
      { supabase: client, provider: new MockEmbeddingProvider() },
      reviewId,
      "quantos participantes",
      5,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].page).toBeGreaterThanOrEqual(1);
    expect(hits[0].source_span.length).toBeGreaterThan(0);
    expect(hits[0].record_id).toBe(recordId);
    expect(typeof hits[0].similarity).toBe("number");
  });
});
```

> Nota: `setupReview`/`seedDoc` são exportados de `embedding-batch.test.ts` (Task 9, Step 1 já os declara com `export`).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/integration/semantic-search.test.ts`
Expected: FAIL — `Cannot find module '@/lib/embedding/search'`.

- [ ] **Step 3: Implementar a busca**

```ts
// src/lib/embedding/search.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddingProvider, SemanticHit } from "@/lib/ai/embedding/types";

export interface SearchDeps {
  supabase: SupabaseClient;
  provider: EmbeddingProvider;
}

/**
 * Busca semântica escopada por Revisão (FR-024/FR-025): embeda a query e chama a
 * RPC match_embedding_chunks (security definer + checagem de membro + filtro
 * review_id explícito → 0 vazamento, SC-008/011). O vetor vai serializado como
 * texto ('[...]'); a RPC faz ::vector.
 */
export async function semanticSearch(
  deps: SearchDeps,
  reviewId: string,
  query: string,
  k = 10,
): Promise<SemanticHit[]> {
  const vec = await deps.provider.embedQuery({ query });
  const { data, error } = await deps.supabase.rpc("match_embedding_chunks", {
    p_review_id: reviewId,
    p_query: `[${vec.join(",")}]`,
    p_k: k,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SemanticHit[];
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npx vitest run tests/integration/semantic-search.test.ts`
Expected: PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add src/lib/embedding/search.ts tests/integration/semantic-search.test.ts
git commit -m "feat(002-f6): semanticSearch via match_embedding_chunks, resultados ancorados (US5/FR-024)"
```

---

### Task 13: Isolamento RLS cross-review (SC-008/SC-011)

**Files:**
- Test: `tests/integration/rls.embedding-chunk.test.ts`

- [ ] **Step 1: Escrever o teste de isolamento**

```ts
// tests/integration/rls.embedding-chunk.test.ts
import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { seedDoc } from "./embedding-batch.test";
import { enqueueEmbeddingJob } from "@/lib/embedding/enqueue";
import { processEmbeddingJob } from "@/lib/embedding/batch-worker";
import { semanticSearch } from "@/lib/embedding/search";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";

describe("isolamento RLS de embedding_chunk (SC-008/SC-011)", () => {
  it("a busca de A nunca retorna chunk da Revisão de B", async () => {
    const svc = serviceClient();

    const { client: ca } = await signUpUser(
      `a_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: ra } = await ca.rpc("create_review", { p_title: "A" });
    const reviewA = ra!.id as string;
    await seedDoc(svc, reviewA, { pages: ["conteúdo exclusivo da revisão A"] });
    const ea = await enqueueEmbeddingJob({ supabase: ca }, reviewA, null);
    await processEmbeddingJob({ supabase: svc, provider: new MockEmbeddingProvider() }, ea.job_id);

    const { client: cb } = await signUpUser(
      `b_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: rb } = await cb.rpc("create_review", { p_title: "B" });
    const reviewB = rb!.id as string;

    // B busca na PRÓPRIA Revisão (vazia) → 0 resultados, nunca chunks de A.
    const hitsB = await semanticSearch(
      { supabase: cb, provider: new MockEmbeddingProvider() },
      reviewB,
      "conteúdo exclusivo da revisão A",
      10,
    );
    expect(hitsB).toHaveLength(0);

    // B tentando buscar dentro da Revisão de A → a RPC rejeita (não-membro).
    await expect(
      semanticSearch(
        { supabase: cb, provider: new MockEmbeddingProvider() },
        reviewA,
        "qualquer",
        10,
      ),
    ).rejects.toThrow();

    // leitura direta da tabela por B não enxerga chunk de A (RLS select).
    const { data: leak } = await cb
      .from("embedding_chunk")
      .select("id")
      .eq("review_id", reviewA);
    expect((leak ?? []).length).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar verde** (a infra das Tasks 1/10/12 já satisfaz)

Run: `npx vitest run tests/integration/rls.embedding-chunk.test.ts`
Expected: PASS (1 teste). Se a busca cross-review NÃO lançar, revise a checagem `is_review_member` na RPC `match_embedding_chunks` (Task 1).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rls.embedding-chunk.test.ts
git commit -m "test(002-f6): isolamento RLS cross-review da busca semântica (SC-008/SC-011)"
```

---

### Task 14: Server Actions da busca

**Files:**
- Create: `app/reviews/[reviewId]/search/actions.ts`

- [ ] **Step 1: Implementar as actions** (resolução de provider + membro; sem chave ⇒ indisponível)

```ts
// app/reviews/[reviewId]/search/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEmbeddingProvider,
  MissingEmbeddingKeyError,
} from "@/lib/ai/embedding";
import { MockEmbeddingProvider } from "@/lib/ai/embedding/mock";
import { enqueueEmbeddingJob } from "@/lib/embedding/enqueue";
import { runEmbeddingBatchWorkerWith } from "@/lib/embedding/batch-run";
import { semanticSearch } from "@/lib/embedding/search";
import { listEmbeddingCandidates } from "@/lib/embedding/queries";
import type { SemanticHit } from "@/lib/ai/embedding/types";

async function requireMember(reviewId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  return data === true;
}

/** Resolve o provider: BYOK 2ª chave quando há; Mock como fallback dev/sem-chave. */
async function resolveProvider(reviewId: string) {
  try {
    return await getEmbeddingProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingEmbeddingKeyError) return new MockEmbeddingProvider();
    throw e;
  }
}

export async function estimateEmbeddingBatch(reviewId: string) {
  if (!(await requireMember(reviewId))) return { ok: false as const, error: "Sem acesso." };
  const supabase = await createClient();
  const candidates = await listEmbeddingCandidates({ supabase }, reviewId);
  const provider = await resolveProvider(reviewId);
  // estimativa grosseira: ~3 chunks por documento candidato (afinável).
  const estimate = await provider.estimateCost({ chunkCount: candidates.length * 3 });
  return { ok: true as const, documentCount: candidates.length, estimate };
}

export async function runEmbeddingBatch(reviewId: string, documentIds: string[] | null) {
  if (!(await requireMember(reviewId))) return { ok: false as const, error: "Sem acesso." };
  const supabase = await createClient();
  const admin = createAdminClient();
  let provider;
  try {
    provider = await getEmbeddingProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingEmbeddingKeyError) {
      return { ok: false as const, unavailable: true, error: "Cadastre a chave de embeddings." };
    }
    throw e;
  }
  const enq = await enqueueEmbeddingJob({ supabase }, reviewId, documentIds);
  await runEmbeddingBatchWorkerWith(admin, provider, reviewId);
  revalidatePath(`/reviews/${reviewId}/search`);
  return { ok: true as const, jobId: enq.job_id, itemCount: enq.item_count };
}

export async function semanticSearchAction(
  reviewId: string,
  query: string,
): Promise<
  | { ok: true; hits: SemanticHit[] }
  | { ok: false; unavailable?: boolean; error: string }
> {
  if (!(await requireMember(reviewId))) return { ok: false, error: "Sem acesso." };
  if (query.trim() === "") return { ok: true, hits: [] };
  const supabase = await createClient();
  let provider;
  try {
    provider = await getEmbeddingProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingEmbeddingKeyError) {
      return { ok: false, unavailable: true, error: "Busca semântica indisponível: cadastre a 2ª chave (embeddings)." };
    }
    throw e;
  }
  const hits = await semanticSearch({ supabase, provider }, reviewId, query, 10);
  return { ok: true, hits };
}

export async function saveEmbeddingKey(reviewId: string, formData: FormData) {
  const { saveByokKey } = await import("@/lib/byok/actions");
  return saveByokKey(reviewId, formData, { purpose: "embedding", provider: "voyage" });
}
```

- [ ] **Step 2: Verificar type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 erros, sem warnings.

- [ ] **Step 3: Commit**

```bash
git add app/reviews/[reviewId]/search/actions.ts
git commit -m "feat(002-f6): server actions de busca (estimate/run/search/saveEmbeddingKey) + fallback indisponível (US5/FR-028)"
```

---

### Task 15: UI da busca semântica (surface `search/`)

**Files:**
- Create: `app/reviews/[reviewId]/search/SemanticSearch.tsx`
- Create: `app/reviews/[reviewId]/search/page.tsx`

> Siga o estilo do `ExtractionBatchRunner.tsx` (Fatia 5) para tom/Tailwind. Componentes client com `'use client'`; labels pt-BR.

- [ ] **Step 1: Componente client de busca**

```tsx
// app/reviews/[reviewId]/search/SemanticSearch.tsx
"use client";

import { useState, useTransition } from "react";
import { semanticSearchAction } from "./actions";
import type { SemanticHit } from "@/lib/ai/embedding/types";

interface Props {
  reviewId: string;
  searchEnabled: boolean;
}

export function SemanticSearch({ reviewId, searchEnabled }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SemanticHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSearch() {
    setMessage(null);
    startTransition(async () => {
      const res = await semanticSearchAction(reviewId, query);
      if (res.ok) {
        setHits(res.hits);
        if (res.hits.length === 0) setMessage("Nenhum trecho encontrado.");
      } else {
        setHits([]);
        setMessage(res.error);
      }
    });
  }

  if (!searchEnabled) {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
        Busca semântica indisponível: cadastre a 2ª chave (embeddings) acima. O
        restante do produto segue operável.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Pergunte em linguagem natural sobre os PDFs…"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={onSearch}
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {message && <p className="text-sm text-gray-600">{message}</p>}

      <ul className="space-y-3">
        {hits.map((h, i) => (
          <li key={i} className="rounded border border-gray-200 p-3">
            <p className="text-sm text-gray-900">{h.source_span}</p>
            <p className="mt-1 text-xs text-gray-500">
              Página {h.page} · origem {h.origin === "ocr_ia" ? "OCR (IA)" : "nativo"} ·
              similaridade {(h.similarity * 100).toFixed(0)}%
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Página server (estado da 2ª chave + lote + busca)**

```tsx
// app/reviews/[reviewId]/search/page.tsx
import { getByokStatus } from "@/lib/byok/queries";
import { listEmbeddingCandidates } from "@/lib/embedding/queries";
import { createClient } from "@/lib/supabase/server";
import { SemanticSearch } from "./SemanticSearch";
import { runEmbeddingBatch, saveEmbeddingKey } from "./actions";

export default async function SearchPage({
  params,
}: {
  params: { reviewId: string };
}) {
  const reviewId = params.reviewId;
  const status = await getByokStatus(reviewId, "embedding");
  const supabase = await createClient();
  const candidates = await listEmbeddingCandidates({ supabase }, reviewId);

  async function runBatch() {
    "use server";
    await runEmbeddingBatch(reviewId, null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Busca semântica</h1>
        <p className="text-sm text-gray-600">
          Recupere trechos dos PDFs por significado, ancorados à página e ao estudo.
        </p>
      </header>

      <section className="rounded border border-gray-200 p-4">
        <h2 className="text-sm font-medium">Chave de embeddings (2ª chave BYOK)</h2>
        {status.present ? (
          <p className="mt-1 text-sm text-green-700">
            Chave cadastrada ({status.provider}).
          </p>
        ) : (
          <form action={saveEmbeddingKey.bind(null, reviewId)} className="mt-2 flex gap-2">
            <input
              name="apiKey"
              type="password"
              placeholder="Chave Voyage AI"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
              Salvar
            </button>
          </form>
        )}
      </section>

      <section className="rounded border border-gray-200 p-4">
        <h2 className="text-sm font-medium">Indexação</h2>
        <p className="mt-1 text-sm text-gray-600">
          {candidates.length} documento(s) processado(s) ainda não indexado(s).
        </p>
        <form action={runBatch} className="mt-2">
          <button
            disabled={!status.present || candidates.length === 0}
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Gerar embeddings
          </button>
        </form>
      </section>

      <section>
        <SemanticSearch reviewId={reviewId} searchEnabled={status.present} />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verificar type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: 0 erros, sem warnings.

- [ ] **Step 4: Commit**

```bash
git add app/reviews/[reviewId]/search/page.tsx app/reviews/[reviewId]/search/SemanticSearch.tsx
git commit -m "feat(002-f6): UI da busca semântica + 2ª chave + indexação (US5/FR-024/FR-028)"
```

---

### Task 16: Verificação final da fatia (CHECKPOINT 3)

**Files:** nenhum (gate).

- [ ] **Step 1: Suíte completa**

Run: `npx vitest run`
Expected: todos verdes; baseline 76 arquivos / 320 testes (Fatia 5) **+** os 7 novos arquivos desta fatia (`chunk`, `mock-embedding`, `voyage`, `byok-purpose`, `embedding-batch`, `semantic-search`, `rls.embedding-chunk`). Confirmar 0 falhas.

- [ ] **Step 2: Lint + types**

Run: `npm run lint && npx tsc --noEmit`
Expected: ✔ No ESLint warnings or errors; 0 erros de tipo.

- [ ] **Step 3: PARAR — CHECKPOINT 3 (não fazer merge/push)**

Apresentar ao desenvolvedor: branch `build/002-marco2-coracao-ai-first/6-busca-semantica`, o diff, e a saída de `npx vitest run` + `npm run lint` + `npx tsc --noEmit`. Aguardar o **merge manual**. Só então atualizar o tracking (`slicing.md` F6 → mergeada + `COMPLETION-fatia-6.md`). **Marco 2 encerra aqui** (última fatia).

---

## Self-Review

**1. Spec coverage (US5 / FR-024..028 + SC-008):**
- FR-024 consulta semântica → trechos ancorados (page/source_span/estudo): Task 12 (`semanticSearch`) + RPC `match_embedding_chunks` (Task 1) + UI (Task 15). ✓
- FR-025 escopo por Revisão (RLS + filtro): RPC com `is_review_member` + `where review_id` (Task 1); teste de isolamento Task 13. ✓
- FR-026 `EmbeddingProvider` (Voyage) + dimensão variável: Tasks 3/5/7; coluna `provider/model/dim` + comentário A3 (Task 1). ✓
- FR-027 job assíncrono retomável/resiliente por-item: Tasks 9–11 (enqueue/worker/run); testes de falha-isolada e retomada (Task 9/10). ✓
- FR-028 2ª chave BYOK distinta + indisponibilidade graciosa: Task 6 (purpose) + Task 7 (resolver) + Tasks 14/15 (fallback "indisponível"). ✓
- SC-008 0 vazamento + ancoragem: Task 13. ✓
- A2 (defaults voyage-3/1024/HNSW m16/ef64) Tasks 1/5; A3 (dim fixa índice vs. variável schema) comentário Task 1. ✓
- Princípio IV (migration+RLS primeiro): Task 1 abre a fatia. ✓
- Não-regressão: única alteração de código herdado é a parametrização do BYOK por `purpose` (exceção justificada §7-B), com default `'llm'` que preserva todos os chamadores atuais (Task 6). ✓

**2. Placeholder scan:** Nenhum "TODO/TBD"; todo passo de código traz o código completo; comandos com saída esperada. ✓

**3. Type consistency:** `EmbeddingProvider`/`Chunk`/`EmbeddedChunk`/`SemanticHit` definidos na Task 3 e usados igual em mock (4), voyage (5), worker (10), search (12). `getEmbeddingProvider` (7) e `MissingEmbeddingKeyError` (3) batem com o uso nas actions (14). `chunkLayers(layers, options)` (8) é chamado com a assinatura certa no worker (10). RPCs `create_embedding_job`/`match_embedding_chunks`/`get_byok_secret(…, p_purpose)`/`set_byok_key(…, p_purpose)` (Task 1) batem com as chamadas em enqueue (9), search (12), byok (6), index (7). ✓

**Risco aberto (decidir no CHECKPOINT 2):** D-F6.1 (Voyage por `fetch` vs. SDK) e D-F6.2 (item = documento). Ambos recomendados como escritos; trocar D-F6.1 é isolado a `voyage.ts`.

---

## Execution Handoff

Plano salvo em `specs/002-marco2-coracao-ai-first/IMPLEMENTATION_PLAN.md` (local definido pelo CLAUDE.md §6, sobrepõe o default da skill).

Conforme o regime desta sessão (CLAUDE.md §5): após a aprovação deste plano (CHECKPOINT 2), a execução é **`using-git-worktrees` → `subagent-driven-development`** (subagente fresco por tarefa + review em dois estágios), e ao fim **PARAR** no CHECKPOINT 3 para o merge manual do desenvolvedor. Esta é a **última fatia** do Marco 2.
