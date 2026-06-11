-- ============================================================
-- Marco 2 / Fatia 4 — Extração por IA: valor extraído por estudo×campo.
-- A IA escreve ai_suggestion + extraction_value(pending/inferred) via service-role
-- (worker server-side, bypassa RLS). O humano ratifica via RPC security-definer
-- auditada (ratify_extraction_value — Task 2). RLS concede só SELECT a membros.
-- data-model.md §extraction_value + §ai_suggestion(estendida) + máquina de estados.
-- Múltiplas linhas por (record,field) são intencionais: histórico de re-extração e
-- coexistência de valor validado + nova sugestão pendente (FR-019a).
-- ============================================================

-- target_kind ganha 'extraction' (aditivo). Usado em runtime, não nesta transação.
alter type ai_target_kind add value if not exists 'extraction';

-- ---------- extraction_value (record × field → valor humano + sugestão) ----------
create table public.extraction_value (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  record_id uuid not null references public.record (id) on delete cascade,
  field_id uuid not null references public.extraction_field (id) on delete cascade,
  ai_suggestion_id uuid references public.ai_suggestion (id) on delete set null,
  final_value jsonb,                                 -- valor humano após ratificação (FR-018)
  state suggestion_state not null default 'pending', -- reusa o enum do Marco 1
  superseded_by_id uuid references public.extraction_value (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),  -- RPCs/worker setam manualmente em cada UPDATE (sem trigger; convenção 0014)
  -- accepted/edited ⇒ final_value obrigatório (data-model §extraction_value)
  constraint extraction_value_final_ck check (
    state not in ('accepted', 'edited') or final_value is not null
  )
);
create index extraction_value_record_field_idx on public.extraction_value (record_id, field_id);
create index extraction_value_review_idx on public.extraction_value (review_id);
-- Guarda de integridade: no máximo UMA sugestão não-ratificada (pending/inferred) viva
-- por (record, field). Validados (accepted/edited) coexistem com nova pendente na
-- re-extração — por isso o índice é escopado só aos estados não-ratificados (FR-019a/Q4).
create unique index extraction_value_active_uidx
  on public.extraction_value (record_id, field_id)
  where state in ('pending', 'inferred');

alter table public.extraction_value enable row level security;

-- Leitura por membros; escrita real é do worker service-role (IA) ou da RPC abaixo (humano).
create policy extraction_value_select_member on public.extraction_value
  for select using (public.is_review_member(review_id));
