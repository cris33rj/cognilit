-- ============================================================
-- Marco 1 / Fatia 6 — Shell, trilho & PRISMA vivo + export de auditoria.
-- US7 / FR-035 (export auditoria), FR-036 (contadores vivos), FR-037 (fila na URL).
-- SEM tabela/mutação nova. Apenas VIEWS derivadas = FONTE ÚNICA dos contadores (SC-004).
-- security_invoker = true ⇒ a view respeita a RLS de record/exclusion_reason (PG15+).
-- audit_entry (0001), record/corpus_state (0003), exclusion_reason (0006) já existem.
-- ============================================================

-- Contadores PRISMA agregados — 1 linha por Revisão (fonte única — FR-036/SC-004).
-- identificados = importados (todos os records); duplicados = exatas + fuzzy confirmadas
-- (corpus_state duplicate_*); triados = ts_decision terminal; demais por corpus_state.
create view public.prisma_counter
  with (security_invoker = true) as
select
  r.id as review_id,
  count(rec.id)                                                         as identified,
  count(rec.id) filter (
    where rec.corpus_state in ('duplicate_exact', 'duplicate_fuzzy'))  as duplicates,
  count(rec.id) filter (
    where rec.ts_decision in ('included', 'excluded'))                 as screened,
  count(rec.id) filter (where rec.corpus_state = 'included_ts')        as included_ts,
  count(rec.id) filter (where rec.corpus_state = 'excluded_ts')        as excluded_ts,
  count(rec.id) filter (where rec.corpus_state = 'maybe_ts')           as maybe_ts,
  count(rec.id) filter (where rec.corpus_state = 'included_ft')        as included_ft,
  count(rec.id) filter (where rec.corpus_state = 'excluded_ft')        as excluded_ft
from public.review r
left join public.record rec on rec.review_id = r.id
group by r.id;

grant select on public.prisma_counter to authenticated;

-- Excluídos no Texto completo, quebrados por motivo (FR-036 "excluídos por razão").
create view public.prisma_exclusion_breakdown
  with (security_invoker = true) as
select
  rec.review_id,
  er.id    as reason_id,
  er.label as reason_label,
  count(rec.id) as n
from public.record rec
join public.exclusion_reason er on er.id = rec.ft_exclusion_reason_id
where rec.corpus_state = 'excluded_ft'
group by rec.review_id, er.id, er.label;

grant select on public.prisma_exclusion_breakdown to authenticated;
