-- ============================================================
-- Marco 1 / Fatia 1 — Fundação: profile, review, member, audit_entry
-- RLS habilitado em TODAS as tabelas (Princípio IV).
-- ============================================================

create extension if not exists "pgcrypto";

-- enums (enum permitido no banco — CLAUDE.md)
create type member_role as enum ('owner', 'reviewer', 'viewer');
create type audit_actor_type as enum ('human', 'ai', 'system');

-- ---------- profile ----------
create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- ---------- review (agregado-raiz) ----------
create table public.review (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  pipeline_config jsonb not null default '{}'::jsonb,
  active_screening_started_at timestamptz,
  created_by uuid not null references public.profile (id),
  created_at timestamptz not null default now()
);

-- ---------- member (usuário ↔ revisão ↔ papel) ----------
create table public.member (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  role member_role not null,
  created_at timestamptz not null default now(),
  unique (review_id, user_id)
);

-- ---------- audit_entry (append-only) ----------
create table public.audit_entry (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  actor_type audit_actor_type not null,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_entry_review_idx on public.audit_entry (review_id, created_at);
create index member_user_idx on public.member (user_id);

-- ============================================================
-- Helper: is_review_member (SECURITY DEFINER evita recursão de RLS)
-- ============================================================
create or replace function public.is_review_member(p_review_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.member m
    where m.review_id = p_review_id
      and m.user_id = auth.uid()
  );
$$;

-- ============================================================
-- Trigger: cria profile ao criar auth.users
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RPC: create_review — review + member(owner) + audit_entry (atômico)
-- ============================================================
create or replace function public.create_review(p_title text)
returns public.review
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.review;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  insert into public.review (title, created_by)
  values (btrim(p_title), auth.uid())
  returning * into v_review;

  insert into public.member (review_id, user_id, role)
  values (v_review.id, auth.uid(), 'owner');

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    v_review.id, 'human', auth.uid(), 'create_review', 'review', v_review.id,
    null, to_jsonb(v_review)
  );

  return v_review;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profile enable row level security;
alter table public.review enable row level security;
alter table public.member enable row level security;
alter table public.audit_entry enable row level security;

-- profile: o próprio usuário
create policy profile_select_own on public.profile
  for select using (id = auth.uid());
create policy profile_update_own on public.profile
  for update using (id = auth.uid()) with check (id = auth.uid());

-- review: membros leem; escrita direta negada (criação via RPC SECURITY DEFINER)
create policy review_select_member on public.review
  for select using (public.is_review_member(id));

-- member: membros da mesma revisão leem; escrita via RPC apenas
create policy member_select_same_review on public.member
  for select using (public.is_review_member(review_id));

-- audit_entry: membros leem; INSERT por membros; SEM update/delete (append-only)
create policy audit_select_member on public.audit_entry
  for select using (public.is_review_member(review_id));
create policy audit_insert_member on public.audit_entry
  for insert with check (public.is_review_member(review_id));

-- Permitir execução da RPC pelo papel autenticado
grant execute on function public.create_review(text) to authenticated;
