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

-- ============================================================
-- RPC: dedup_exact — remove duplicatas exatas (FR-018), reversível (FR-019).
-- Idempotente: opera só sobre 'active'; promove 'imported'→'active' primeiro.
-- Chave: doi_normalized; na ausência, title_norm + metadata->>'year' (R2).
-- Sobrevivente = mais antigo (created_at, id). Retorna nº de removidos nesta execução.
-- Pré-condição: chamado após a importação concluir (runImportWorker). Promove TODOS
-- os records 'imported' da Revisão para 'active' — esse é o comportamento desejado:
-- um record só existe se seu item foi inserido com sucesso (worker, Fatia 3).
-- ============================================================
create or replace function public.dedup_exact(p_review_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed int := 0;
  r record;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  -- Registros importados entram no corpus como 'active'.
  update public.record
     set corpus_state = 'active', updated_at = now()
   where review_id = p_review_id and corpus_state = 'imported';

  for r in
    with keyed as (
      select
        id, created_at,
        case
          when coalesce(nullif(doi_normalized, ''), '') <> '' then 'doi:' || doi_normalized
          when coalesce(nullif(title_norm, ''), '') <> ''
            then 'tt:' || title_norm || '|' || coalesce(metadata ->> 'year', '')
          else null
        end as dkey
      from public.record
      where review_id = p_review_id and corpus_state = 'active'
    ),
    ranked as (
      select
        id, dkey,
        first_value(id) over (partition by dkey order by created_at, id) as keep_id,
        row_number()  over (partition by dkey order by created_at, id) as rn
      from keyed
      where dkey is not null
    )
    select id, keep_id from ranked where rn > 1
  loop
    update public.record
       set corpus_state = 'duplicate_exact', updated_at = now()
     where id = r.id;

    insert into public.dedup_decision (review_id, kind, record_a_id, record_b_id, outcome, actor)
    values (p_review_id, 'exact_auto', r.keep_id, r.id, 'removed', 'system');

    insert into public.audit_entry (
      review_id, actor_type, actor_id, action, entity, entity_id, before, after
    )
    values (
      p_review_id, 'system', null, 'dedup_exact_remove', 'record', r.id,
      jsonb_build_object('corpus_state', 'active'),
      jsonb_build_object('corpus_state', 'duplicate_exact', 'kept', r.keep_id)
    );

    v_removed := v_removed + 1;
  end loop;

  return v_removed;
end;
$$;

grant execute on function public.dedup_exact(uuid) to authenticated;

-- ============================================================
-- RPC: reverse_dedup — desfaz uma decisão (exata ou fuzzy), por item, a qualquer
-- momento (Q4). Restaura record_b para 'active', marca is_reversed, NÃO apaga a
-- decisão e escreve NOVA audit_entry (FR-019/021/026).
-- ============================================================
create or replace function public.reverse_dedup(p_decision_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dedup_decision;
begin
  select * into d from public.dedup_decision where id = p_decision_id;
  if d.id is null then
    raise exception 'decision not found';
  end if;
  if not public.is_review_member(d.review_id) then
    raise exception 'not a member';
  end if;
  if d.is_reversed then
    raise exception 'decision already reversed';
  end if;

  if d.outcome in ('removed', 'merged') and d.record_b_id is not null then
    update public.record
       set corpus_state = 'active', updated_at = now()
     where id = d.record_b_id
       and corpus_state in ('duplicate_exact', 'duplicate_fuzzy');
  end if;

  update public.dedup_decision
     set is_reversed = true, reversed_at = now()
   where id = d.id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    d.review_id, 'human', auth.uid(), 'dedup_reverse', 'dedup_decision', d.id,
    jsonb_build_object('is_reversed', false),
    jsonb_build_object('is_reversed', true, 'restored_record', d.record_b_id)
  );
end;
$$;

grant execute on function public.reverse_dedup(uuid) to authenticated;
