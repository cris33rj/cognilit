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
  select * into d from public.dedup_decision where id = p_decision_id for update;
  if not found then
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
    -- Restaura só se ainda for duplicata: se o record já foi movido a outro estado
    -- por operação posterior, não o tocamos (a decisão é marcada revertida de todo modo).
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

-- ============================================================
-- RPC: list_fuzzy_candidates — pares de alta similaridade p/ confirmação humana
-- (FR-020). similarity(title_norm) >= limiar E mesmo ano, entre 'active',
-- excluindo pares já decididos (fuzzy_human vivo). a.id < b.id evita duplicar par.
-- ============================================================
create or replace function public.list_fuzzy_candidates(
  p_review_id uuid,
  p_threshold real default 0.92
)
returns table (
  record_a_id uuid,
  record_b_id uuid,
  similarity  real,
  title_a text,
  title_b text,
  year_a  text,
  year_b  text
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

  -- Pré-filtro index-backed: o operador % usa similarity() simétrica (R2) e o GIN
  -- trgm index (record_title_trgm_idx). Casamos o limiar do % ao p_threshold.
  perform set_config('pg_trgm.similarity_threshold', p_threshold::text, true);

  return query
  select
    a.id,
    b.id,
    sim.value,
    a.metadata ->> 'title',
    b.metadata ->> 'title',
    a.metadata ->> 'year',
    b.metadata ->> 'year'
  from public.record a
  cross join lateral (
    select r.id, r.title_norm, r.metadata
    from public.record r
    where r.review_id = p_review_id
      and r.corpus_state = 'active'
      and r.id > a.id
      and (r.metadata ->> 'year') is not distinct from (a.metadata ->> 'year')
      and coalesce(nullif(r.title_norm, ''), '') <> ''
      and r.title_norm % a.title_norm          -- GIN-index probe (symmetric similarity)
  ) b
  cross join lateral (select similarity(a.title_norm, b.title_norm)::real as value) sim
  where a.review_id = p_review_id
    and a.corpus_state = 'active'
    and coalesce(nullif(a.title_norm, ''), '') <> ''
    and sim.value >= p_threshold               -- recheck exato (autoritativo)
    and not exists (
      select 1
      from public.dedup_decision d
      where d.review_id = p_review_id
        and d.kind = 'fuzzy_human'
        and d.is_reversed = false
        and (
          (d.record_a_id = a.id and d.record_b_id = b.id) or
          (d.record_a_id = b.id and d.record_b_id = a.id)
        )
    )
  order by sim.value desc;
end;
$$;

grant execute on function public.list_fuzzy_candidates(uuid, real) to authenticated;

-- ============================================================
-- RPC: decide_fuzzy — decisão humana de um par fuzzy (FR-020), reversível (FR-021).
-- 'merged'        ⇒ record_b vira duplicate_fuzzy (record_a sobrevive).
-- 'kept_distinct' ⇒ nenhum estado muda; a decisão registrada tira o par da fila.
-- ============================================================
create or replace function public.decide_fuzzy(
  p_review_id uuid,
  p_record_a uuid,
  p_record_b uuid,
  p_outcome dedup_outcome,
  p_similarity real
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_before_b text;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  if p_outcome not in ('merged', 'kept_distinct') then
    raise exception 'invalid fuzzy outcome';
  end if;

  if not exists (select 1 from public.record where id = p_record_a and review_id = p_review_id) then
    raise exception 'record_a does not belong to this review';
  end if;
  select corpus_state::text into v_before_b
    from public.record where id = p_record_b and review_id = p_review_id;
  if v_before_b is null then
    raise exception 'record_b does not belong to this review';
  end if;

  if p_outcome = 'merged' then
    update public.record
       set corpus_state = 'duplicate_fuzzy', updated_at = now()
     where id = p_record_b and review_id = p_review_id and corpus_state = 'active';
    if not found then
      raise exception 'record_b is not active (cannot merge)';
    end if;
  end if;

  insert into public.dedup_decision (
    review_id, kind, record_a_id, record_b_id, similarity, outcome, actor
  )
  values (
    p_review_id, 'fuzzy_human', p_record_a, p_record_b, p_similarity, p_outcome, 'human'
  )
  returning id into v_id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  )
  values (
    p_review_id, 'human', auth.uid(), 'dedup_fuzzy_decide', 'dedup_decision', v_id,
    case when p_outcome = 'merged'
         then jsonb_build_object('record_b_corpus_state', v_before_b)
         else null end,
    jsonb_build_object('outcome', p_outcome, 'record_a', p_record_a, 'record_b', p_record_b)
  );

  return v_id;
end;
$$;

grant execute on function public.decide_fuzzy(uuid, uuid, uuid, dedup_outcome, real) to authenticated;
