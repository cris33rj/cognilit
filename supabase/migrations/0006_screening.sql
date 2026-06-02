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

-- ============================================================
-- RPC: decide_screening — registra decisão humana + transiciona record + audita.
-- Texto completo exige ts_decision=included (Q1) e motivo p/ exclude (FR-025).
-- 'maybe' só em title_abstract. 1ª decisão da Revisão trava o protocolo (FR-010).
-- Retorna o id da screening_decision criada. A IA nunca chama isto (FR-024).
-- ============================================================
create or replace function public.decide_screening(
  p_review_id uuid,
  p_record_id uuid,
  p_stage screening_stage,
  p_decision screening_choice,
  p_exclusion_reason_id uuid default null,
  p_ai_suggestion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.record;
  v_id uuid;
  v_new_state corpus_state;
  v_first boolean;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  select * into v_rec from public.record
   where id = p_record_id and review_id = p_review_id;
  if not found then
    raise exception 'record not found';
  end if;

  if p_stage = 'full_text' then
    if v_rec.ts_decision is distinct from 'included' then
      raise exception 'record must be included at title_abstract before full_text';
    end if;
    if p_decision = 'maybe' then
      raise exception 'maybe is not allowed at full_text';
    end if;
    if p_decision = 'exclude' and p_exclusion_reason_id is null then
      raise exception 'exclusion reason required at full_text';
    end if;
  end if;

  select not exists (select 1 from public.screening_decision where review_id = p_review_id)
    into v_first;

  insert into public.screening_decision (
    review_id, record_id, stage, decision, exclusion_reason_id, ai_suggestion_id
  ) values (
    p_review_id, p_record_id, p_stage, p_decision, p_exclusion_reason_id, p_ai_suggestion_id
  ) returning id into v_id;

  if p_stage = 'title_abstract' then
    v_new_state := (case p_decision
      when 'include' then 'included_ts' when 'exclude' then 'excluded_ts'
      else 'maybe_ts' end)::corpus_state;
    update public.record set
      ts_decision = (case p_decision
        when 'include' then 'included' when 'exclude' then 'excluded'
        else 'maybe' end)::ts_decision_state,
      corpus_state = v_new_state, updated_at = now()
    where id = p_record_id;
  else
    v_new_state := (case p_decision
      when 'include' then 'included_ft' else 'excluded_ft' end)::corpus_state;
    update public.record set
      ft_decision = (case p_decision
        when 'include' then 'included' else 'excluded' end)::ft_decision_state,
      ft_exclusion_reason_id = p_exclusion_reason_id,
      corpus_state = v_new_state, updated_at = now()
    where id = p_record_id;
  end if;

  -- FR-010: a 1ª decisão de triagem trava o protocolo (se existir).
  if v_first and exists (select 1 from public.protocol where review_id = p_review_id) then
    perform public.lock_protocol(p_review_id);
  end if;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'screening_decide', 'record', p_record_id,
    jsonb_build_object('corpus_state', v_rec.corpus_state,
                       'ts_decision', v_rec.ts_decision, 'ft_decision', v_rec.ft_decision),
    jsonb_build_object('stage', p_stage, 'decision', p_decision,
                       'corpus_state', v_new_state, 'decision_id', v_id)
  );

  return v_id;
end;
$$;
grant execute on function
  public.decide_screening(uuid, uuid, screening_stage, screening_choice, uuid, uuid)
  to authenticated;

-- ============================================================
-- RPC: reverse_screening — desfaz uma decisão por item, a qualquer momento (Q4).
-- Restaura o estado anterior da etapa (T/R → active; Texto completo → included_ts),
-- marca is_reversed, NÃO apaga a decisão, e escreve NOVA audit_entry (FR-026).
-- ============================================================
create or replace function public.reverse_screening(p_decision_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.screening_decision;
  v_rec public.record;
begin
  select * into d from public.screening_decision where id = p_decision_id;
  if d.id is null then
    raise exception 'decision not found';
  end if;
  if not public.is_review_member(d.review_id) then
    raise exception 'not a member';
  end if;
  if d.is_reversed then
    raise exception 'decision already reversed';
  end if;

  select * into v_rec from public.record where id = d.record_id;

  if d.stage = 'title_abstract' then
    update public.record
       set ts_decision = null, corpus_state = 'active', updated_at = now()
     where id = d.record_id;
  else
    update public.record
       set ft_decision = null, ft_exclusion_reason_id = null,
           corpus_state = 'included_ts', updated_at = now()
     where id = d.record_id;
  end if;

  update public.screening_decision
     set is_reversed = true, reversed_at = now()
   where id = d.id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    d.review_id, 'human', auth.uid(), 'screening_reverse', 'screening_decision', d.id,
    jsonb_build_object('corpus_state', v_rec.corpus_state),
    jsonb_build_object('is_reversed', true, 'restored_record', d.record_id)
  );
end;
$$;
grant execute on function public.reverse_screening(uuid) to authenticated;

-- ============================================================
-- RPC: list_screening_queue — registros do estágio + última sugestão de IA anexada.
-- title_abstract: corpus_state em active/maybe_ts/included_ts/excluded_ts.
-- full_text:      corpus_state em included_ts/included_ft/excluded_ft.
-- ============================================================
create or replace function public.list_screening_queue(
  p_review_id uuid,
  p_stage screening_stage
)
returns table (
  record_id uuid,
  title text,
  abstract text,
  year text,
  corpus_state corpus_state,
  ts_decision ts_decision_state,
  ft_decision ft_decision_state,
  ft_exclusion_reason_id uuid,
  ai_suggestion_id uuid,
  ai_recommendation text,
  ai_confidence real,
  ai_reason text,
  ai_state suggestion_state
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  return query
  select
    r.id,
    r.metadata ->> 'title',
    r.metadata ->> 'abstract',
    r.metadata ->> 'year',
    r.corpus_state, r.ts_decision, r.ft_decision, r.ft_exclusion_reason_id,
    s.id, s.output ->> 'recommendation', (s.output ->> 'confidence')::real,
    s.output ->> 'reason', s.state
  from public.record r
  left join lateral (
    select a.id, a.output, a.state
    from public.ai_suggestion a
    where a.target_kind = 'screening' and a.target_id = r.id
    order by a.created_at desc
    limit 1
  ) s on true
  where r.review_id = p_review_id
    and (
      (p_stage = 'title_abstract'
        and r.corpus_state in ('active','maybe_ts','included_ts','excluded_ts'))
      or
      (p_stage = 'full_text'
        and r.corpus_state in ('included_ts','included_ft','excluded_ft'))
    )
  order by r.created_at;
end;
$$;
grant execute on function public.list_screening_queue(uuid, screening_stage) to authenticated;

-- ============================================================
-- RPC: create_screening_job — cria job ai_screening_batch + job_items (1/registro),
-- só sobre registros elegíveis (active/maybe_ts/included_ts), audita. Não processa
-- (§VIII). p_record_ids = subconjunto opcional (lote sobre seleção).
-- ============================================================
create or replace function public.create_screening_job(
  p_review_id uuid,
  p_record_ids jsonb default null
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
  values (p_review_id, 'ai_screening_batch', 'queued')
  returning * into v_job;

  insert into public.job_item (job_id, review_id, status, payload)
  select v_job.id, p_review_id, 'pending', jsonb_build_object('record_id', r.id)
  from public.record r
  where r.review_id = p_review_id
    and r.corpus_state in ('active','maybe_ts','included_ts')
    and (
      p_record_ids is null
      or r.id::text in (select jsonb_array_elements_text(p_record_ids))
    );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'enqueue_screening_batch', 'job', v_job.id,
    null, jsonb_build_object('item_count', v_count)
  );

  return v_job;
end;
$$;
grant execute on function public.create_screening_job(uuid, jsonb) to authenticated;
