-- ============================================================
-- Marco 3 / Fatia 2 — Síntese qualitativa assistida (US1 / FR-001..007, FR-005a).
-- Aditivo (não-regressão Marco ≥ 2): tabelas novas + 2 enum ADD VALUE + RPCs.
-- A RPC create_synthesis_job só ENFILEIRA (§VIII); o worker Node agrega.
-- ============================================================

alter type ai_target_kind add value if not exists 'synthesis_theme';
alter type job_type add value if not exists 'synthesis_batch';

create table public.synthesis (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','generating','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.theme (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  synthesis_id uuid not null references public.synthesis(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  narrative text not null default '',
  "order" int not null default 0,
  summary_table jsonb,
  ai_suggestion_id uuid references public.ai_suggestion(id) on delete set null,
  state text not null default 'pending'
    check (state in ('pending','accepted','edited','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index theme_synthesis_idx on public.theme(synthesis_id, "order");

create table public.theme_finding (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  theme_id uuid not null references public.theme(id) on delete cascade,
  extraction_value_id uuid not null
    references public.extraction_value(id) on delete cascade,
  "order" int not null default 0,
  created_at timestamptz not null default now()
);
create index theme_finding_theme_idx on public.theme_finding(theme_id, "order");

alter table public.synthesis enable row level security;
alter table public.theme enable row level security;
alter table public.theme_finding enable row level security;

create policy synthesis_member on public.synthesis
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));
create policy theme_member on public.theme
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));
create policy theme_finding_member on public.theme_finding
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));

create or replace function public.create_synthesis_job(p_review_id uuid)
returns public.job
language plpgsql security definer set search_path = public as $$
declare v_job public.job; v_count int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'synthesis_batch', 'queued')
  returning * into v_job;

  insert into public.job_item (job_id, review_id, status, payload)
  select v_job.id, p_review_id, 'pending', jsonb_build_object('record_id', r.id)
  from public.record r
  where r.review_id = p_review_id
    and r.corpus_state = 'included_ft'
    and exists (
      select 1 from public.extraction_value ev
      where ev.record_id = r.id and ev.state in ('accepted','edited')
    );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'enqueue_synthesis_batch', 'job', v_job.id,
    null, jsonb_build_object('item_count', v_count)
  );
  return v_job;
end; $$;
grant execute on function public.create_synthesis_job(uuid) to authenticated;

create or replace function public.set_theme_state(
  p_theme_id uuid, p_state text, p_name text default null, p_narrative text default null
) returns public.theme
language plpgsql security definer set search_path = public as $$
declare v_before public.theme; v_after public.theme; v_review uuid;
begin
  select * into v_before from public.theme where id = p_theme_id;
  if v_before.id is null then raise exception 'theme not found'; end if;
  v_review := v_before.review_id;
  if not public.is_review_member(v_review) then raise exception 'not a member'; end if;
  if p_state not in ('accepted','edited','rejected') then
    raise exception 'invalid state';
  end if;

  update public.theme set
    state = p_state,
    name = coalesce(p_name, name),
    narrative = coalesce(p_narrative, narrative),
    updated_at = now()
  where id = p_theme_id returning * into v_after;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    v_review, 'human', auth.uid(), 'ratify_theme', 'theme', p_theme_id,
    to_jsonb(v_before), to_jsonb(v_after)
  );
  return v_after;
end; $$;
grant execute on function public.set_theme_state(uuid, text, text, text) to authenticated;

create or replace function public.reorder_themes(
  p_synthesis_id uuid, p_theme_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare v_review uuid;
begin
  select review_id into v_review from public.synthesis where id = p_synthesis_id;
  if v_review is null then raise exception 'synthesis not found'; end if;
  if not public.is_review_member(v_review) then raise exception 'not a member'; end if;
  update public.theme t set "order" = ord.idx - 1
  from (select unnest(p_theme_ids) as id, generate_subscripts(p_theme_ids, 1) as idx) ord
  where t.id = ord.id and t.synthesis_id = p_synthesis_id;
  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, after)
  values (v_review, 'human', auth.uid(), 'reorder_themes', 'synthesis', p_synthesis_id,
          jsonb_build_object('order', to_jsonb(p_theme_ids)));
end; $$;
grant execute on function public.reorder_themes(uuid, uuid[]) to authenticated;

create or replace function public.merge_themes(
  p_theme_ids uuid[], p_name text
) returns public.theme
language plpgsql security definer set search_path = public as $$
declare v_review uuid; v_synth uuid; v_target public.theme;
begin
  if p_theme_ids is null or cardinality(p_theme_ids) < 2 then
    raise exception 'merge_themes requires at least 2 theme ids';
  end if;

  select review_id, synthesis_id into v_review, v_synth
  from public.theme where id = p_theme_ids[1];
  if not public.is_review_member(v_review) then raise exception 'not a member'; end if;

  insert into public.theme (review_id, synthesis_id, name, narrative, state, "order")
  select v_review, v_synth, p_name,
         string_agg(t.narrative, E'\n\n' order by t."order"), 'edited', min(t."order")
  from public.theme t where t.id = any(p_theme_ids)
  returning * into v_target;

  update public.theme_finding set theme_id = v_target.id where theme_id = any(p_theme_ids);
  update public.theme set state = 'rejected', updated_at = now()
  where id = any(p_theme_ids) and id <> v_target.id;

  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, after)
  values (v_review, 'human', auth.uid(), 'merge_themes', 'theme', v_target.id,
          jsonb_build_object('sources', to_jsonb(p_theme_ids)));
  return v_target;
end; $$;
grant execute on function public.merge_themes(uuid[], text) to authenticated;

create or replace function public.split_theme(
  p_theme_id uuid, p_parts jsonb
) returns setof public.theme
language plpgsql security definer set search_path = public as $$
declare v_review uuid; v_synth uuid; v_part jsonb; v_new public.theme;
begin
  if p_parts is null or jsonb_array_length(p_parts) = 0 then
    raise exception 'split_theme requires at least one part';
  end if;

  select review_id, synthesis_id into v_review, v_synth
  from public.theme where id = p_theme_id;
  if not public.is_review_member(v_review) then raise exception 'not a member'; end if;

  for v_part in select * from jsonb_array_elements(p_parts) loop
    insert into public.theme (review_id, synthesis_id, name, narrative, state, "order")
    values (v_review, v_synth, v_part->>'name', coalesce(v_part->>'narrative',''), 'edited',
            (select coalesce(max("order"),0)+1 from public.theme where synthesis_id = v_synth))
    returning * into v_new;
    update public.theme_finding set theme_id = v_new.id
    where theme_id = p_theme_id
      and extraction_value_id in (
        select (jsonb_array_elements_text(v_part->'findingRefs'))::uuid);
    return next v_new;
  end loop;

  update public.theme set state = 'rejected', updated_at = now() where id = p_theme_id;
  insert into public.audit_entry (review_id, actor_type, actor_id, action, entity, entity_id, after)
  values (v_review, 'human', auth.uid(), 'split_theme', 'theme', p_theme_id, p_parts);
end; $$;
grant execute on function public.split_theme(uuid, jsonb) to authenticated;
