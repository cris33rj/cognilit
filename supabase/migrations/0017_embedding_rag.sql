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
