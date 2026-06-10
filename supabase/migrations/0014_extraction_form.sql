-- ============================================================
-- Marco 2 / Fatia 3 — Formulário de extração configurável (US2 / D9).
-- extraction_form é 1:1 com review (Q2). extraction_field é tipado e usa
-- soft-delete (is_active) para nunca apagar silenciosamente valores futuros
-- (extraction_value chega na Fatia 4). Escrita real via RPC auditada (abaixo);
-- RLS concede só SELECT a membros. data-model.md §extraction_form/§extraction_field.
-- ============================================================

-- tipo do campo (enum no banco — CLAUDE.md). FR-009.
create type extraction_field_type as enum ('text', 'number', 'date', 'boolean', 'select');

-- ---------- extraction_form (1:1 com review — Q2/FR-011) ----------
create table public.extraction_form (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- extraction_field (campo tipado — FR-009/010) ----------
create table public.extraction_field (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  form_id uuid not null references public.extraction_form (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),     -- não-vazio
  type extraction_field_type not null,
  options jsonb,                                            -- valores p/ type=select
  sort_order integer not null default 0,                   -- ordenação (FR-009)
  is_active boolean not null default true,                 -- soft-delete (decisão 2)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- select ⇒ options é array não-vazio; não-select ⇒ options nulo (decisão 4)
  constraint extraction_field_options_ck check (
    case
      when type = 'select'
        then options is not null and jsonb_typeof(options) = 'array' and jsonb_array_length(options) > 0
      else options is null
    end
  )
);
create index extraction_field_form_idx on public.extraction_field (form_id, sort_order);
create index extraction_field_review_idx on public.extraction_field (review_id);

alter table public.extraction_form  enable row level security;
alter table public.extraction_field enable row level security;

-- Leitura por membros; escrita só pelas RPCs security-definer (Task 2-6).
create policy extraction_form_select on public.extraction_form
  for select using (public.is_review_member(review_id));
create policy extraction_field_select on public.extraction_field
  for select using (public.is_review_member(review_id));
