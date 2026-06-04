-- ============================================================
-- Marco 1 / Fatia 8 — Motivos de exclusão derivados dos critérios de elegibilidade.
-- Espelha critérios de exclusão ratificados (accepted/edited) como motivos de
-- exclusão do Texto completo, mantém-nos sincronizados, e dedup por label literal.
-- RLS já em exclusion_reason (0006). Toda mutação é RPC security definer que
-- escreve audit_entry (Princípio III / D-F5.1). is_review_member de 0001.
-- NÃO altera a view prisma_exclusion_breakdown (0007): ela junta por id sem
-- filtrar is_active, então motivos derivados/desativados-porém-usados resolvem.
-- ============================================================

-- ---------- novas colunas em exclusion_reason ----------
-- dismissed = remoção EXPLÍCITA do usuário (decisão pegajosa). Distingue-se da
-- desativação automática de órfãos (is_active=false, dismissed=false), que é
-- reativável quando o critério volta a ser ratificado. Um motivo dispensado NÃO
-- é ressuscitado por sync (derivado) nem por seed (genérico); só volta se o
-- usuário re-adicionar o mesmo label.
alter table public.exclusion_reason
  add column source_criterion_id uuid
    references public.eligibility_criterion (id) on delete set null,
  add column origin text not null default 'seed'
    check (origin in ('seed', 'criterion', 'manual')),
  add column dismissed boolean not null default false;

-- Impede espelhar o mesmo critério duas vezes na mesma Revisão.
create unique index exclusion_reason_source_criterion_uidx
  on public.exclusion_reason (review_id, source_criterion_id)
  where source_criterion_id is not null;

-- ---------- normalização de label p/ dedup literal ----------
create or replace function public.normalize_reason_label(text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace($1, '\s+', ' ', 'g')));
$$;

-- ============================================================
-- seed_default_exclusion_reasons — idempotente POR LABEL (não mais all-or-nothing).
-- Mantém assinatura, os 7 labels e sort_orders. Insere cada label genérico (origin
-- 'seed') SOMENTE se nenhum motivo ATIVO da Revisão já tem o mesmo label normalizado.
-- ============================================================
create or replace function public.seed_default_exclusion_reasons(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_defaults constant text[] := array[
    'População fora do escopo',
    'Intervenção/exposição não elegível',
    'Desfecho não relevante',
    'Desenho de estudo inelegível',
    'Idioma não elegível',
    'Texto completo indisponível',
    'Duplicata não detectada'
  ];
  v_label text;
  v_idx int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  v_idx := 0;
  foreach v_label in array v_defaults loop
    v_idx := v_idx + 1;
    -- Não semeia se já existe motivo ATIVO ou DISPENSADO com o mesmo label:
    -- dispensado = o usuário removeu de propósito; respeitar a decisão.
    if not exists (
      select 1 from public.exclusion_reason er
      where er.review_id = p_review_id
        and (er.is_active or er.dismissed)
        and public.normalize_reason_label(er.label)
            = public.normalize_reason_label(v_label)
    ) then
      insert into public.exclusion_reason (review_id, label, sort_order, origin)
      values (p_review_id, v_label, v_idx, 'seed');
    end if;
  end loop;
end;
$$;
grant execute on function public.seed_default_exclusion_reasons(uuid) to authenticated;

-- ============================================================
-- sync_exclusion_reasons_from_criteria — espelha critérios de exclusão ratificados
-- como motivos do Texto completo. Cria/atualiza espelhos; desativa órfãos não usados.
-- ============================================================
create or replace function public.sync_exclusion_reasons_from_criteria(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crit record;
  v_mirror public.exclusion_reason;
  v_next_order int;
  v_created int := 0;
  v_updated int := 0;
  v_deactivated int := 0;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  -- 1) Cada critério de exclusão ratificado (accepted/edited).
  for v_crit in
    select c.id, c.text
    from public.eligibility_criterion c
    where c.review_id = p_review_id
      and c.kind = 'exclusion'
      and c.ratification_state in ('accepted', 'edited')
  loop
    select * into v_mirror
    from public.exclusion_reason
    where review_id = p_review_id and source_criterion_id = v_crit.id;

    if not found then
      -- Sem espelho: cria, a menos que já haja motivo ATIVO ou DISPENSADO com o
      -- mesmo label normalizado (dispensado = o usuário removeu de propósito).
      if not exists (
        select 1 from public.exclusion_reason er
        where er.review_id = p_review_id
          and (er.is_active or er.dismissed)
          and public.normalize_reason_label(er.label)
              = public.normalize_reason_label(v_crit.text)
      ) then
        select coalesce(max(sort_order), 0) + 1 into v_next_order
        from public.exclusion_reason where review_id = p_review_id;
        insert into public.exclusion_reason
          (review_id, label, sort_order, is_active, origin, source_criterion_id)
        values
          (p_review_id, v_crit.text, v_next_order, true, 'criterion', v_crit.id);
        v_created := v_created + 1;
      end if;
    elsif not v_mirror.dismissed then
      -- Espelho existe e NÃO foi dispensado pelo usuário: atualiza label se o texto
      -- do critério mudou E/OU reativa se estava desativado (critério re-ratificado).
      -- Espelho dispensado é deixado intacto (respeita a remoção do usuário).
      if v_mirror.label is distinct from v_crit.text or not v_mirror.is_active then
        update public.exclusion_reason
          set label = v_crit.text, is_active = true
        where id = v_mirror.id;
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  -- 2) Espelhos cujo critério não está mais ratificado: desativa SE não usado.
  with orphans as (
    select er.id
    from public.exclusion_reason er
    where er.review_id = p_review_id
      and er.source_criterion_id is not null
      and er.is_active
      and not exists (
        select 1 from public.eligibility_criterion c
        where c.id = er.source_criterion_id
          and c.ratification_state in ('accepted', 'edited')
      )
      and not exists (
        select 1 from public.record r
        where r.ft_exclusion_reason_id = er.id
      )
  )
  update public.exclusion_reason er
    set is_active = false
  from orphans o
  where er.id = o.id;
  get diagnostics v_deactivated = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'sync_exclusion_reasons', 'review', p_review_id,
    null,
    jsonb_build_object(
      'created', v_created, 'updated', v_updated, 'deactivated', v_deactivated
    )
  );
end;
$$;
grant execute on function public.sync_exclusion_reasons_from_criteria(uuid) to authenticated;

-- ============================================================
-- ensure_exclusion_reasons — deriva dos critérios PRIMEIRO, depois semeia genéricos
-- (assim os seeds só preenchem labels ainda ausentes).
-- ============================================================
create or replace function public.ensure_exclusion_reasons(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  perform public.sync_exclusion_reasons_from_criteria(p_review_id);
  perform public.seed_default_exclusion_reasons(p_review_id);
end;
$$;
grant execute on function public.ensure_exclusion_reasons(uuid) to authenticated;

-- ============================================================
-- add_exclusion_reason — adiciona motivo manual; dedup por label normalizado.
-- ============================================================
create or replace function public.add_exclusion_reason(p_review_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_existing public.exclusion_reason;
  v_id uuid;
  v_next_order int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  v_label := btrim(p_label);
  if v_label = '' then
    raise exception 'label required';
  end if;

  -- Dedup por label normalizado contra QUALQUER motivo (ativo ou não), preferindo
  -- o ativo. Se houver um dispensado/inativo com o mesmo label, revive-o (em vez
  -- de criar duplicata) — é o caminho de "re-adicionar" um motivo removido.
  select * into v_existing
  from public.exclusion_reason
  where review_id = p_review_id
    and public.normalize_reason_label(label)
        = public.normalize_reason_label(v_label)
  order by is_active desc
  limit 1;
  if found then
    if v_existing.is_active then
      return v_existing.id; -- no-op dedup
    end if;
    update public.exclusion_reason
      set is_active = true, dismissed = false
    where id = v_existing.id;
    insert into public.audit_entry (
      review_id, actor_type, actor_id, action, entity, entity_id, before, after
    ) values (
      p_review_id, 'human', auth.uid(), 'add_exclusion_reason', 'exclusion_reason',
      v_existing.id,
      jsonb_build_object('is_active', v_existing.is_active, 'dismissed', v_existing.dismissed),
      jsonb_build_object('is_active', true, 'dismissed', false, 'revived', true)
    );
    return v_existing.id;
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_next_order
  from public.exclusion_reason where review_id = p_review_id;

  insert into public.exclusion_reason (review_id, label, sort_order, origin)
  values (p_review_id, v_label, v_next_order, 'manual')
  returning id into v_id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'add_exclusion_reason', 'exclusion_reason', v_id,
    null, jsonb_build_object('label', v_label, 'origin', 'manual')
  );

  return v_id;
end;
$$;
grant execute on function public.add_exclusion_reason(uuid, text) to authenticated;

-- ============================================================
-- set_exclusion_reason_active — soft delete (nunca DELETE: preserva PRISMA).
-- ============================================================
create or replace function public.set_exclusion_reason_active(
  p_reason_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason public.exclusion_reason;
begin
  select * into v_reason from public.exclusion_reason where id = p_reason_id;
  if not found then
    raise exception 'exclusion reason not found';
  end if;
  if not public.is_review_member(v_reason.review_id) then
    raise exception 'not a member';
  end if;

  -- Ao REATIVAR, respeita o invariante de dedup por label normalizado:
  -- não pode haver dois motivos ATIVOS com o mesmo label na mesma Revisão.
  if p_active then
    if exists (
      select 1 from public.exclusion_reason er
      where er.review_id = v_reason.review_id
        and er.id <> p_reason_id
        and er.is_active
        and public.normalize_reason_label(er.label)
            = public.normalize_reason_label(v_reason.label)
    ) then
      raise exception 'another active reason already uses this label';
    end if;
  end if;

  -- Desativar = dispensar (decisão pegajosa: sync/seed não ressuscitam).
  -- Reativar = des-dispensar.
  update public.exclusion_reason
    set is_active = p_active, dismissed = not p_active
  where id = p_reason_id;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    v_reason.review_id, 'human', auth.uid(), 'set_exclusion_reason_active',
    'exclusion_reason', p_reason_id,
    jsonb_build_object('is_active', v_reason.is_active, 'dismissed', v_reason.dismissed),
    jsonb_build_object('is_active', p_active, 'dismissed', not p_active)
  );
end;
$$;
grant execute on function public.set_exclusion_reason_active(uuid, boolean) to authenticated;
