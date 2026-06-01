-- ============================================================
-- Marco 1 / Fatia 3 — Importação & jobs: search, record, job, job_item
-- RLS habilitado em TODAS as tabelas (Princípio IV).
-- Parsing valida no enqueue; persistência (record) no worker (D-F3.4).
-- ============================================================

create extension if not exists pg_trgm;

-- enums
create type source_format    as enum ('ris', 'bibtex', 'csv');
create type corpus_state      as enum (
  'imported', 'active',
  'duplicate_exact', 'duplicate_fuzzy',
  'excluded_ts', 'maybe_ts', 'included_ts', 'excluded_ft', 'included_ft'
);
create type ts_decision_state as enum ('included', 'excluded', 'maybe');
create type ft_decision_state as enum ('included', 'excluded');
create type job_type          as enum ('import_parse', 'ai_screening_batch');
create type job_status        as enum (
  'queued', 'running', 'completed', 'completed_with_errors', 'failed'
);
create type job_item_status   as enum ('pending', 'done', 'failed');

-- ---------- search (busca registrada — US2/FR-015) ----------
create table public.search (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  query_string text not null,
  database text not null,
  searched_on date not null,
  hits integer not null check (hits >= 0),
  created_at timestamptz not null default now()
);
create index search_review_idx on public.search (review_id, created_at);

-- ---------- record (registro bibliográfico — US2/US3/US4) ----------
create table public.record (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  search_id uuid references public.search (id) on delete set null,
  source_format source_format not null,
  raw jsonb not null,
  metadata jsonb not null,
  doi_normalized text,
  title_norm text,
  corpus_state corpus_state not null default 'imported',
  ts_decision ts_decision_state,
  ft_decision ft_decision_state,
  ft_exclusion_reason_id uuid, -- FK adicionada na Fatia 5 (exclusion_reason)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index record_review_idx on public.record (review_id, created_at);
create index record_doi_idx on public.record (review_id, doi_normalized);
create index record_title_trgm_idx on public.record using gin (title_norm gin_trgm_ops);

-- ---------- job + job_item (jobs assíncronos — §VIII/R3) ----------
create table public.job (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  type job_type not null,
  status job_status not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  estimated_cost jsonb,
  actual_cost jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index job_review_idx on public.job (review_id, created_at desc);

create table public.job_item (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job (id) on delete cascade,
  review_id uuid not null references public.review (id) on delete cascade,
  status job_item_status not null default 'pending',
  payload jsonb not null,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create index job_item_job_idx on public.job_item (job_id, status);

-- ============================================================
-- RPC: create_import_job — search + job + job_items + audit (atômico)
-- ============================================================
create or replace function public.create_import_job(
  p_review_id uuid,
  p_format source_format,
  p_search jsonb,
  p_items jsonb  -- array de ParsedRecord
)
returns public.job
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search public.search;
  v_job public.job;
  v_item jsonb;
  v_count int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count is null or v_count = 0 then
    raise exception 'no records to import';
  end if;

  insert into public.search (review_id, query_string, database, searched_on, hits)
  values (
    p_review_id,
    p_search ->> 'queryString',
    p_search ->> 'database',
    (p_search ->> 'searchedOn')::date,
    (p_search ->> 'hits')::int
  )
  returning * into v_search;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'import_parse', 'queued')
  returning * into v_job;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.job_item (job_id, review_id, payload)
    values (
      v_job.id, p_review_id,
      jsonb_build_object('record', v_item, 'search_id', v_search.id, 'format', p_format)
    );
  end loop;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    p_review_id, 'human', auth.uid(), 'enqueue_import', 'job', v_job.id,
    null, jsonb_build_object('item_count', v_count, 'search_id', v_search.id)
  );

  return v_job;
end;
$$;

-- ============================================================
-- RPC: insert_import_record — insere record + marca item done + audit (atômico)
-- ============================================================
create or replace function public.insert_import_record(
  p_review_id uuid,
  p_search_id uuid,
  p_job_item_id uuid,
  p_source_format source_format,
  p_raw jsonb,
  p_metadata jsonb,
  p_doi_normalized text,
  p_title_norm text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
begin
  insert into public.record (
    review_id, search_id, source_format, raw, metadata,
    doi_normalized, title_norm, corpus_state
  )
  values (
    p_review_id, p_search_id, p_source_format, p_raw, p_metadata,
    nullif(p_doi_normalized, ''), nullif(p_title_norm, ''), 'imported'
  )
  returning id into v_record_id;

  update public.job_item set status = 'done' where id = p_job_item_id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    p_review_id, 'system', null, 'import_record', 'record', v_record_id,
    null, jsonb_build_object('source_format', p_source_format)
  );

  return v_record_id;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.search   enable row level security;
alter table public.record   enable row level security;
alter table public.job      enable row level security;
alter table public.job_item enable row level security;

create policy search_select   on public.search   for select using (public.is_review_member(review_id));
create policy record_select   on public.record   for select using (public.is_review_member(review_id));
create policy job_select      on public.job      for select using (public.is_review_member(review_id));
create policy job_item_select on public.job_item for select using (public.is_review_member(review_id));

-- ============================================================
-- Grants
-- ============================================================
grant execute on function public.create_import_job(uuid, source_format, jsonb, jsonb) to authenticated;
revoke execute on function public.insert_import_record(uuid, uuid, uuid, source_format, jsonb, jsonb, text, text) from authenticated, anon, public;
grant  execute on function public.insert_import_record(uuid, uuid, uuid, source_format, jsonb, jsonb, text, text) to service_role;
