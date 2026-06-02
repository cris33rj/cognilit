-- ============================================================
-- Marco 1 / Fatia 5 — Triagem em duas etapas + IA-no-laço.
-- US4 / FR-022..026, FR-028..029, FR-033, FR-039..041, FR-010 (lock).
-- RLS habilitado (Princípio IV). Toda mutação é RPC security definer que
-- escreve audit_entry (Princípio III). A IA nunca decide (Princípio I, FR-024).
-- record/ corpus_state/ ts_decision_state/ ft_decision_state já existem (0003).
-- lock_protocol / ai_suggestion / ai_usage já existem (0002).
-- ============================================================

-- ---------- exclusion_reason (lista configurável por Revisão — US4/FR-025) ----------
create table public.exclusion_reason (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index exclusion_reason_review_idx on public.exclusion_reason (review_id, sort_order);

-- FK pendente da Fatia 3 (record.ft_exclusion_reason_id) agora resolvível.
alter table public.record
  add constraint record_ft_exclusion_reason_fk
  foreign key (ft_exclusion_reason_id)
  references public.exclusion_reason (id) on delete set null;

alter table public.exclusion_reason enable row level security;
create policy exclusion_reason_select on public.exclusion_reason
  for select using (public.is_review_member(review_id));
create policy exclusion_reason_insert on public.exclusion_reason
  for insert with check (public.is_review_member(review_id));
create policy exclusion_reason_update on public.exclusion_reason
  for update using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));

-- ---------- seed idempotente dos motivos padrão (D-F5.4) ----------
create or replace function public.seed_default_exclusion_reasons(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  if exists (select 1 from public.exclusion_reason where review_id = p_review_id) then
    return; -- idempotente: já há lista (possivelmente customizada)
  end if;
  insert into public.exclusion_reason (review_id, label, sort_order) values
    (p_review_id, 'População fora do escopo', 1),
    (p_review_id, 'Intervenção/exposição não elegível', 2),
    (p_review_id, 'Desfecho não relevante', 3),
    (p_review_id, 'Desenho de estudo inelegível', 4),
    (p_review_id, 'Idioma não elegível', 5),
    (p_review_id, 'Texto completo indisponível', 6),
    (p_review_id, 'Duplicata não detectada', 7);
end;
$$;
grant execute on function public.seed_default_exclusion_reasons(uuid) to authenticated;

-- ---------- enums de triagem ----------
create type screening_stage  as enum ('title_abstract', 'full_text');
create type screening_choice as enum ('include', 'exclude', 'maybe');

-- ---------- screening_decision (decisão de triagem — US4) ----------
create table public.screening_decision (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  record_id uuid not null references public.record (id) on delete cascade,
  stage screening_stage not null,
  decision screening_choice not null,
  exclusion_reason_id uuid references public.exclusion_reason (id) on delete set null,
  ai_suggestion_id uuid references public.ai_suggestion (id) on delete set null,
  is_reversed boolean not null default false,
  reversed_at timestamptz,
  actor text not null default 'human', -- a IA nunca decide (Princípio I / FR-024)
  created_at timestamptz not null default now(),
  -- FR-025: exclusão no Texto completo exige motivo.
  constraint screening_ft_reason_required
    check (not (stage = 'full_text' and decision = 'exclude' and exclusion_reason_id is null)),
  -- 'maybe' só existe no Título/Resumo (Q1).
  constraint screening_maybe_only_ts
    check (not (stage = 'full_text' and decision = 'maybe'))
);
create index screening_review_idx on public.screening_decision (review_id, created_at desc);
create index screening_record_live_idx
  on public.screening_decision (record_id) where is_reversed = false;

alter table public.screening_decision enable row level security;
create policy screening_select on public.screening_decision
  for select using (public.is_review_member(review_id));
-- INSERT/UPDATE só via RPCs security definer abaixo (sem policy de write).
