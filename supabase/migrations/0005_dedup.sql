-- ============================================================
-- Marco 1 / Fatia 4 — Deduplicação: dedup_decision + RPCs
-- US3 / FR-018..021, FR-026. RLS habilitado (Princípio IV).
-- Toda lógica de dedup é RPC security definer e escreve audit_entry (Princípio III).
-- ============================================================

create type dedup_kind    as enum ('exact_auto', 'fuzzy_human');
create type dedup_outcome as enum ('removed', 'merged', 'kept_distinct');
create type dedup_actor   as enum ('system', 'human');

-- ---------- dedup_decision (decisão de dedup — US3) ----------
-- record_a_id = sobrevivente/mantido; record_b_id = removido/mesclado (nullable p/ data-model).
create table public.dedup_decision (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  kind dedup_kind not null,
  record_a_id uuid not null references public.record (id) on delete cascade,
  record_b_id uuid references public.record (id) on delete cascade,
  similarity real,
  outcome dedup_outcome not null,
  is_reversed boolean not null default false,
  reversed_at timestamptz,
  actor dedup_actor not null,
  created_at timestamptz not null default now(),
  constraint dedup_distinct_pair check (record_b_id is null or record_b_id <> record_a_id),
  constraint dedup_reversed_consistency check (is_reversed = (reversed_at is not null)),
  constraint dedup_similarity_range check (similarity is null or (similarity >= 0.0 and similarity <= 1.0))
);
create index dedup_review_idx on public.dedup_decision (review_id, created_at desc);
-- Acelera o "par já decidido?" da fila fuzzy (apenas decisões vivas).
create index dedup_active_pair_idx
  on public.dedup_decision (review_id, record_a_id, record_b_id)
  where is_reversed = false;

-- ---------- RLS ----------
alter table public.dedup_decision enable row level security;
create policy dedup_select on public.dedup_decision
  for select using (public.is_review_member(review_id));
-- INSERT/UPDATE de dedup_decision só via RPCs security definer (próximas tasks); sem policy de write.
