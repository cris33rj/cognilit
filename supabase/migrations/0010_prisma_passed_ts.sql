-- ============================================================
-- Marco 1 / Fatia 9 — Correção da semântica PRISMA (fluxo cumulativo).
-- SC-004/FR-036. SEM tabela/mutação nova. Só recria a VIEW prisma_counter
-- (fonte única) acrescentando UMA coluna derivada ao final.
--
-- Problema: corpus_state é máquina de INVENTÁRIO (um estado por registro).
-- included_ts só conta quem passou no T/R e AINDA aguarda Texto Completo; ao
-- receber decisão de TC o registro transiciona para included_ft/excluded_ft e
-- deixa included_ts. Logo, com todos avançados, included_ts = 0 — mas o PRISMA
-- ("Reports assessed for eligibility") precisa do total CUMULATIVO que passou
-- no T/R, que não some quando os itens avançam.
--
-- passed_ts = included_ts + included_ft + excluded_ft (cumulativo).
--   maybe_ts (dúvida) NÃO entra: não passou no T/R (bloqueia avanço, Q1).
--
-- create or replace view só permite ACRESCENTAR colunas ao final; security_invoker
-- e grants são preservados pelo replace. prisma_exclusion_breakdown não é tocada.
-- ============================================================

create or replace view public.prisma_counter
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
  count(rec.id) filter (where rec.corpus_state = 'excluded_ft')        as excluded_ft,
  count(rec.id) filter (
    where rec.corpus_state in ('included_ts', 'included_ft', 'excluded_ft')) as passed_ts
from public.review r
left join public.record rec on rec.review_id = r.id
group by r.id;
