-- ============================================================
-- Marco 1 / Incremento 8.1 — Bloqueia remoção de motivo de exclusão EM USO.
-- set_exclusion_reason_active(p_active=false) passa a recusar a desativação
-- enquanto houver artigo excluído no Texto completo (corpus_state='excluded_ft')
-- apontando para o motivo. Acrescenta list_reason_usage para a UI listar esses
-- artigos (título + decision_id da decisão de TC viva) e oferecer "Desfazer".
-- RLS via is_review_member (0001). NÃO toca a view prisma_exclusion_breakdown (0007).
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
  select * into v_reason from public.exclusion_reason where id = p_reason_id for update;
  if not found then
    raise exception 'exclusion reason not found';
  end if;
  if not public.is_review_member(v_reason.review_id) then
    raise exception 'not a member';
  end if;

  -- Bloqueia a REMOÇÃO (desativação) de um motivo em uso: há artigo excluído no
  -- Texto completo que o referencia. O usuário deve reverter essas exclusões antes
  -- (caminho via list_reason_usage + "Desfazer"). O PRISMA permanece íntegro.
  if not p_active then
    if exists (
      select 1 from public.record r
      where r.ft_exclusion_reason_id = p_reason_id
        and r.corpus_state = 'excluded_ft'
    ) then
      raise exception 'exclusion reason in use';
    end if;
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

-- ============================================================
-- list_reason_usage — artigos excluídos no TC que usam o motivo, com o id da
-- decisão de TC viva (stage='full_text', is_reversed=false) para o "Desfazer".
-- Mesmo conjunto que o PRISMA reporta sob o motivo (corpus_state='excluded_ft').
-- ============================================================
create or replace function public.list_reason_usage(p_reason_id uuid)
returns table (
  record_id uuid,
  title text,
  decision_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_review_id uuid;
begin
  select review_id into v_review_id
  from public.exclusion_reason where id = p_reason_id;
  if v_review_id is null then
    raise exception 'exclusion reason not found';
  end if;
  if not public.is_review_member(v_review_id) then
    raise exception 'not a member';
  end if;

  return query
  select
    r.id,
    r.metadata ->> 'title',
    sd.id
  from public.record r
  -- Sob os invariantes (todo excluded_ft tem uma decisão de TC viva) sd.id é
  -- sempre não-nulo; o LEFT JOIN é defensivo. A UI usa decision_id no "Desfazer".
  left join lateral (
    select s.id
    from public.screening_decision s
    where s.record_id = r.id
      and s.stage = 'full_text'
      and s.is_reversed = false
    order by s.created_at desc
    limit 1
  ) sd on true
  where r.ft_exclusion_reason_id = p_reason_id
    and r.corpus_state = 'excluded_ft'
  order by r.metadata ->> 'title';
end;
$$;
grant execute on function public.list_reason_usage(uuid) to authenticated;
