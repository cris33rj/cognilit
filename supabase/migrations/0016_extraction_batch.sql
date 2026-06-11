-- ============================================================
-- Marco 2 / Fatia 5 — Extração por IA em lote (US4 / FR-021..023).
-- Aditivo (não-regressão Marco ≥ 2): novo valor de enum job_type + RPC de enqueue.
-- A RPC só ENFILEIRA (cria job + job_item); o trabalho pesado roda no worker
-- server-side Node (§VIII / A1). Espelha create_screening_job (0006).
-- Elegibilidade: estudo no Texto completo (included_ft) com PDF já processado.
-- O literal 'ai_extraction_batch' é usado só em RUNTIME (corpo plpgsql), não nesta
-- transação — mesmo padrão de 0015 (alter type + create function no mesmo arquivo).
-- ============================================================

-- job_type ganha 'ai_extraction_batch' (aditivo; usado em runtime).
alter type job_type add value if not exists 'ai_extraction_batch';

-- ---------- RPC: create_extraction_job (enqueue de lote — FR-021) ----------
create or replace function public.create_extraction_job(
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
  values (p_review_id, 'ai_extraction_batch', 'queued')
  returning * into v_job;

  -- Um job_item por estudo elegível: incluído no Texto completo (included_ft) E
  -- com PDF processado (text_ready/partial). Mesmo predicado de
  -- listExtractionBatchCandidates (FR-021) — manter os dois em sincronia.
  insert into public.job_item (job_id, review_id, status, payload)
  select v_job.id, p_review_id, 'pending', jsonb_build_object('record_id', r.id)
  from public.record r
  where r.review_id = p_review_id
    and r.corpus_state = 'included_ft'
    and exists (
      select 1 from public.document d
      where d.record_id = r.id
        and d.processing_status in ('text_ready', 'partial')
    )
    and (
      p_record_ids is null
      or r.id::text in (select jsonb_array_elements_text(p_record_ids))
    );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'enqueue_extraction_batch', 'job', v_job.id,
    null, jsonb_build_object('item_count', v_count)
  );

  return v_job;
end;
$$;

grant execute on function public.create_extraction_job(uuid, jsonb) to authenticated;
