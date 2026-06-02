-- ============================================================
-- Marco 1 / Fatia 5 — Triagem: exclusion_reason + FK + RLS + seed RPC
-- US4 / FR-022..026, FR-028, FR-029, FR-039..041.
-- RLS habilitado (Princípio IV). seed_default_exclusion_reasons é idempotente.
-- ============================================================

-- ---------- exclusion_reason (lista configurável por revisão — US4) ----------
create table public.exclusion_reason (
  id         uuid    primary key default gen_random_uuid(),
  review_id  uuid    not null references public.review (id) on delete cascade,
  label      text    not null,
  is_active  boolean not null default true,
  "order"    integer not null default 0,
  created_at timestamptz not null default now()
);
create index excl_reason_review_idx on public.exclusion_reason (review_id, "order");

-- ---------- FK: record.ft_exclusion_reason_id → exclusion_reason ----------
-- A coluna já existe (criada sem constraint na Fatia 3); adicionamos a FK agora.
alter table public.record
  add constraint fk_record_ft_exclusion_reason
  foreign key (ft_exclusion_reason_id)
  references public.exclusion_reason (id)
  on delete set null;

-- ---------- RLS ----------
alter table public.exclusion_reason enable row level security;

create policy excl_reason_select on public.exclusion_reason
  for select using (public.is_review_member(review_id));

create policy excl_reason_insert on public.exclusion_reason
  for insert with check (public.is_review_member(review_id));

create policy excl_reason_update on public.exclusion_reason
  for update using (public.is_review_member(review_id));

create policy excl_reason_delete on public.exclusion_reason
  for delete using (public.is_review_member(review_id));

-- ---------- RPC: seed_default_exclusion_reasons (idempotente) ----------
-- Insere o conjunto padrão de motivos de exclusão para uma Revisão.
-- É idempotente: verifica se já existem razões antes de inserir (ON CONFLICT
-- seria ideal, mas não temos unique constraint em label; usamos EXISTS por label).
-- Chamada pelo worker de importação ao concluir a primeira importação da Revisão,
-- ou explicitamente pelo usuário ao criar a Revisão.
create or replace function public.seed_default_exclusion_reasons(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  defaults text[] := array[
    'Fora do escopo temático',
    'População inadequada',
    'Intervenção inadequada',
    'Desfecho não relevante',
    'Desenho de estudo inadequado',
    'Texto completo indisponível',
    'Duplicata não detectada automaticamente',
    'Idioma não coberto pelo protocolo'
  ];
  lbl text;
  ord int := 0;
begin
  foreach lbl in array defaults loop
    if not exists (
      select 1 from public.exclusion_reason
       where review_id = p_review_id and label = lbl
    ) then
      insert into public.exclusion_reason (review_id, label, is_active, "order")
      values (p_review_id, lbl, true, ord);
    end if;
    ord := ord + 1;
  end loop;
end;
$$;

grant execute on function public.seed_default_exclusion_reasons(uuid) to authenticated;
grant execute on function public.seed_default_exclusion_reasons(uuid) to service_role;
