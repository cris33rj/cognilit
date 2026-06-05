-- 0011_regenerate_eligibility_criteria.sql
-- Fatia 11 — re-derivação segura de critérios de elegibilidade.
-- RPC autoritativa: recusa se o protocolo travou (a base de elegibilidade só muda
-- por emenda — FR-010/011), registra a sugestão de IA (proveniência preservada),
-- substitui SÓ os critérios de IA ainda pendentes (preserva humanos e ratificados),
-- e insere o lote novo deduplicado por rótulo normalizado contra os sobreviventes.

create or replace function public.regenerate_eligibility_criteria(
  p_review_id  uuid,
  p_output     jsonb,
  p_provenance jsonb,
  p_not_found  boolean,
  p_items      jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_id uuid;
  v_state       protocol_state;
  v_sug         uuid;
  v_count       integer;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  select id into v_question_id
  from public.question
  where review_id = p_review_id;
  if v_question_id is null then
    raise exception 'question not found';
  end if;

  -- Guarda de fase (FR-010): elegibilidade congela quando o protocolo trava.
  select state into v_state
  from public.protocol
  where review_id = p_review_id;
  if v_state = 'locked' then
    raise exception 'protocol is locked; eligibility changes must be amendments';
  end if;

  -- Proveniência da nova sugestão (histórico preservado; não apaga ai_suggestion).
  insert into public.ai_suggestion (
    review_id, target_kind, target_id, output, provenance, state, not_found
  ) values (
    p_review_id, 'eligibility', v_question_id, p_output, p_provenance, 'pending', p_not_found
  )
  returning id into v_sug;

  -- Supersede: remove SÓ as sugestões de IA ainda não ratificadas.
  delete from public.eligibility_criterion
  where review_id = p_review_id
    and origin = 'ai'
    and ratification_state = 'pending';

  -- Insere o lote novo deduplicado por rótulo normalizado:
  --   (a) dentro do próprio lote (distinct on);
  --   (b) contra TODO critério sobrevivente (humano + ratificado) — a IA não
  --       re-propõe o já aceito/editado nem re-empurra o rejeitado.
  insert into public.eligibility_criterion (
    review_id, question_id, kind, text, origin, ratification_state, ai_suggestion_id
  )
  select p_review_id, v_question_id, x.kind, x.text, 'ai', 'pending', v_sug
  from (
    select distinct on (public.normalize_reason_label(text)) kind, text
    from jsonb_to_recordset(p_items) as r(kind criterion_kind, text text)
    where btrim(text) <> ''
    order by public.normalize_reason_label(text)
  ) x
  where public.normalize_reason_label(x.text) not in (
    select public.normalize_reason_label(text)
    from public.eligibility_criterion
    where review_id = p_review_id
  );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'derive_criteria', 'ai_suggestion', v_sug,
    null, jsonb_build_object('count', v_count)
  );

  return v_count;
end;
$$;

grant execute on function
  public.regenerate_eligibility_criteria(uuid, jsonb, jsonb, boolean, jsonb)
  to authenticated;
