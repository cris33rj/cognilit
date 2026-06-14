-- ============================================================
-- Marco 3 / Fatia 3 — Relatório estruturado (US3 / FR-012..017).
-- Aditivo (não-regressão Marco ≥ 2): tabelas novas + 2 enum ADD VALUE + RPCs.
-- Determinístico por padrão; Discussão/Conclusão via worker Node (report_draft).
-- A RPC create_report_draft_job só ENFILEIRA (§VIII); o worker Node monta/rascunha.
-- ============================================================

alter type ai_target_kind add value if not exists 'report_section';
alter type job_type        add value if not exists 'report_draft';

create type report_section_kind as enum (
  'methods', 'results', 'discussion', 'conclusion', 'ai_declaration', 'deviations'
);
create type report_section_edit_state as enum (
  'deterministic', 'ai_generated', 'human_edited'
);

create table public.report (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','generating','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_section (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  report_id uuid not null references public.report(id) on delete cascade,
  kind report_section_kind not null,
  content text not null default '',
  edit_state report_section_edit_state not null default 'deterministic',
  ai_suggestion_id uuid references public.ai_suggestion(id) on delete set null,
  "order" int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, kind)
);
create index report_section_report_idx on public.report_section(report_id, "order");

alter table public.report enable row level security;
alter table public.report_section enable row level security;

create policy report_member on public.report
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));
create policy report_section_member on public.report_section
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));

-- create_report_draft_job: só enfileira. Item = uma seção IA (discussion|conclusion).
create or replace function public.create_report_draft_job(p_review_id uuid)
returns public.job
language plpgsql security definer set search_path = public as $$
declare v_job public.job;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  if exists (
    select 1 from public.job
    where review_id = p_review_id
      and type = 'report_draft'
      and status in ('queued','running')
  ) then
    raise exception 'report draft job already in progress';
  end if;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'report_draft', 'queued')
  returning * into v_job;

  insert into public.job_item (job_id, review_id, status, payload)
  values
    (v_job.id, p_review_id, 'pending', jsonb_build_object('kind', 'discussion')),
    (v_job.id, p_review_id, 'pending', jsonb_build_object('kind', 'conclusion'));

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'enqueue_report_draft', 'job', v_job.id,
    null, jsonb_build_object('type', 'report_draft', 'item_count', 2)
  );
  return v_job;
end; $$;
grant execute on function public.create_report_draft_job(uuid) to authenticated;

-- set_report_section_content: edição humana auditada (FR-016).
-- Editáveis → human_edited: 'methods', 'discussion', 'conclusion'.
-- Deterministic-only (rejeitados): 'results' (A3 — fonte única é a Síntese),
-- 'ai_declaration' e 'deviations' (factuais).
create or replace function public.set_report_section_content(
  p_section_id uuid, p_content text
) returns public.report_section
language plpgsql security definer set search_path = public as $$
declare v_before public.report_section; v_after public.report_section;
begin
  select * into v_before from public.report_section where id = p_section_id;
  if v_before.id is null then raise exception 'section not found'; end if;
  if not public.is_review_member(v_before.review_id) then
    raise exception 'not a member';
  end if;
  if v_before.kind in ('results','ai_declaration','deviations') then
    raise exception 'section is deterministic and not editable';
  end if;

  update public.report_section set
    content = p_content,
    edit_state = 'human_edited',
    updated_at = now()
  where id = p_section_id returning * into v_after;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    v_before.review_id, 'human', auth.uid(), 'update', 'report_section', p_section_id,
    jsonb_build_object('content', v_before.content, 'edit_state', v_before.edit_state),
    jsonb_build_object('content', v_after.content, 'edit_state', v_after.edit_state)
  );
  return v_after;
end; $$;
grant execute on function public.set_report_section_content(uuid, text) to authenticated;
