-- ============================================================
-- Marco 1 / Fatia 2 — Pergunta, Protocolo, IA/BYOK
-- RLS em TODAS as tabelas (Princípio IV). Auditoria em mudanças (Princípio III).
-- Reusa public.is_review_member(uuid) da migration 0001.
-- ============================================================

create extension if not exists supabase_vault with schema vault;

-- ---------- enums ----------
create type question_framework as enum ('spider', 'pico', 'peo', 'pcc', 'free');
create type criterion_kind     as enum ('inclusion', 'exclusion', 'search_term');
create type criterion_origin   as enum ('human', 'ai');
create type ratification_state as enum ('pending', 'accepted', 'edited', 'rejected');
create type protocol_state     as enum ('draft', 'locked');
create type protocol_origin    as enum ('ai_draft', 'human');
create type ai_target_kind     as enum ('eligibility', 'protocol_draft', 'screening');
create type suggestion_state   as enum ('pending', 'accepted', 'edited', 'rejected', 'inferred');
create type llm_provider       as enum ('anthropic');

-- ---------- ai_suggestion (transversal) ----------
create table public.ai_suggestion (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  target_kind ai_target_kind not null,
  target_id uuid,
  output jsonb not null,
  provenance jsonb not null,
  state suggestion_state not null default 'pending',
  grounding jsonb,
  not_found boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ai_suggestion_provenance_keys check (
    provenance ? 'model' and provenance ? 'version'
    and provenance ? 'prompt_or_span' and provenance ? 'timestamp'
  )
);

-- ---------- question (US5) ----------
create table public.question (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review (id) on delete cascade,
  framework question_framework not null default 'spider',
  fields jsonb not null default '{}'::jsonb,
  question_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- eligibility_criterion (US5) ----------
create table public.eligibility_criterion (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  question_id uuid not null references public.question (id) on delete cascade,
  kind criterion_kind not null,
  text text not null check (length(btrim(text)) > 0),
  origin criterion_origin not null,
  ratification_state ratification_state not null default 'pending',
  ai_suggestion_id uuid references public.ai_suggestion (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint criterion_ai_needs_suggestion check (
    origin <> 'ai' or ai_suggestion_id is not null
  )
);

-- ---------- protocol (US6) ----------
create table public.protocol (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  state protocol_state not null default 'draft',
  locked_at timestamptz,
  origin protocol_origin not null default 'human',
  ai_suggestion_id uuid references public.ai_suggestion (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- protocol_amendment (US6) ----------
create table public.protocol_amendment (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  protocol_id uuid not null references public.protocol (id) on delete cascade,
  version int not null,
  change jsonb not null,
  dated_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (protocol_id, version)
);

-- ---------- byok_key (R5/FR-032) ----------
create table public.byok_key (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review (id) on delete cascade,
  provider llm_provider not null default 'anthropic',
  vault_secret_id uuid not null,
  created_at timestamptz not null default now()
);

-- ---------- ai_usage (FR-033/P5) ----------
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  phase text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost jsonb not null default '{}'::jsonb,
  job_id uuid,
  created_at timestamptz not null default now()
);

create index ai_suggestion_review_idx on public.ai_suggestion (review_id, created_at);
create index criterion_review_idx     on public.eligibility_criterion (review_id);
create index amendment_protocol_idx   on public.protocol_amendment (protocol_id, version);
create index ai_usage_review_phase_idx on public.ai_usage (review_id, phase);

-- ============================================================
-- Trigger: protocolo travado é imutável em content (FR-011/SC-010)
-- ============================================================
create or replace function public.guard_locked_protocol()
returns trigger
language plpgsql
as $$
begin
  if old.state = 'locked' then
    if new.content is distinct from old.content then
      raise exception 'protocol is locked; changes must be amendments';
    end if;
    if new.state <> 'locked' then
      raise exception 'protocol cannot be unlocked';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protocol_guard_locked
  before update on public.protocol
  for each row execute function public.guard_locked_protocol();

-- ============================================================
-- RPC: lock_protocol — trava + marca review + audita (idempotente)
-- ============================================================
create or replace function public.lock_protocol(p_review_id uuid)
returns public.protocol
language plpgsql
security definer
set search_path = public
as $$
declare
  v_protocol public.protocol;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  select * into v_protocol from public.protocol where review_id = p_review_id;
  if not found then
    raise exception 'protocol not found';
  end if;
  if v_protocol.state = 'locked' then
    return v_protocol;
  end if;

  update public.protocol
     set state = 'locked', locked_at = now()
   where id = v_protocol.id
   returning * into v_protocol;

  update public.review
     set active_screening_started_at = coalesce(active_screening_started_at, now())
   where id = p_review_id;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'lock_protocol', 'protocol', v_protocol.id,
          jsonb_build_object('state', 'draft'), jsonb_build_object('state', 'locked'));

  return v_protocol;
end;
$$;

-- ============================================================
-- RPC: add_protocol_amendment — só se locked; versão sequencial; audita
-- ============================================================
create or replace function public.add_protocol_amendment(p_review_id uuid, p_change jsonb)
returns public.protocol_amendment
language plpgsql
security definer
set search_path = public
as $$
declare
  v_protocol public.protocol;
  v_amendment public.protocol_amendment;
  v_version int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  select * into v_protocol from public.protocol where review_id = p_review_id;
  if not found then raise exception 'protocol not found'; end if;
  if v_protocol.state <> 'locked' then
    raise exception 'amendments require a locked protocol';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
    from public.protocol_amendment where protocol_id = v_protocol.id;

  insert into public.protocol_amendment (review_id, protocol_id, version, change)
  values (p_review_id, v_protocol.id, v_version, p_change)
  returning * into v_amendment;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'add_protocol_amendment', 'protocol_amendment',
          v_amendment.id, null, to_jsonb(v_amendment));

  return v_amendment;
end;
$$;

-- ============================================================
-- BYOK no Vault: gravar (membro) / decifrar (apenas service_role)
-- ============================================================
create or replace function public.set_byok_key(p_review_id uuid, p_provider llm_provider, p_api_key text)
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

  delete from public.byok_key where review_id = p_review_id;

  v_secret_id := vault.create_secret(
    p_api_key,
    'byok:' || p_review_id::text || ':' || p_provider::text,
    'BYOK LLM key for review ' || p_review_id::text
  );

  insert into public.byok_key (review_id, provider, vault_secret_id)
  values (p_review_id, p_provider, v_secret_id)
  returning * into v_row;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, before, after)
  values (p_review_id, 'human', auth.uid(), 'set_byok_key', 'byok_key', v_row.id,
          null, jsonb_build_object('provider', p_provider));

  return v_row;
end;
$$;

-- Decifragem: somente service_role (D-F2.4). NÃO concedida a authenticated.
create or replace function public.get_byok_secret(p_review_id uuid)
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
   where k.review_id = p_review_id;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.ai_suggestion         enable row level security;
alter table public.question              enable row level security;
alter table public.eligibility_criterion enable row level security;
alter table public.protocol              enable row level security;
alter table public.protocol_amendment    enable row level security;
alter table public.byok_key              enable row level security;
alter table public.ai_usage              enable row level security;

create policy ai_suggestion_rw on public.ai_suggestion
  for all using (public.is_review_member(review_id)) with check (public.is_review_member(review_id));

create policy question_rw on public.question
  for all using (public.is_review_member(review_id)) with check (public.is_review_member(review_id));

create policy criterion_rw on public.eligibility_criterion
  for all using (public.is_review_member(review_id)) with check (public.is_review_member(review_id));

create policy protocol_select on public.protocol
  for select using (public.is_review_member(review_id));
create policy protocol_insert on public.protocol
  for insert with check (public.is_review_member(review_id));
create policy protocol_update on public.protocol
  for update using (public.is_review_member(review_id)) with check (public.is_review_member(review_id));

create policy amendment_select on public.protocol_amendment
  for select using (public.is_review_member(review_id));

create policy byok_select on public.byok_key
  for select using (public.is_review_member(review_id));

create policy ai_usage_select on public.ai_usage
  for select using (public.is_review_member(review_id));
create policy ai_usage_insert on public.ai_usage
  for insert with check (public.is_review_member(review_id));

-- ============================================================
-- Grants
-- ============================================================
grant execute on function public.lock_protocol(uuid)                    to authenticated;
grant execute on function public.add_protocol_amendment(uuid, jsonb)    to authenticated;
grant execute on function public.set_byok_key(uuid, llm_provider, text) to authenticated;
grant execute on function public.get_byok_secret(uuid) to service_role;
revoke execute on function public.get_byok_secret(uuid) from authenticated, anon, public;
