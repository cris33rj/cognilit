-- ============================================================
-- Marco 3 / Fatia 4 — Checklist PRISMA 2020 auto-preenchido (US4 / FR-018).
-- Snapshot por Revisão: 1 linha por item PRISMA (27 itens, seed estático em TS).
-- Gravado na geração/regeneração do relatório. status computado da cobertura.
-- Aditivo (não-regressão): tabela + enum novos, nenhum ALTER em objeto existente.
-- data-model.md §prisma_checklist_item; research.md R5.
-- ============================================================

create type prisma_checklist_status as enum ('met', 'pending', 'not_applicable');

create table public.prisma_checklist_item (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  item_code text not null,
  label text not null,
  section_ref text,
  status prisma_checklist_status not null,
  computed_at timestamptz not null default now(),
  unique (review_id, item_code)
);
-- Sem índice extra em (review_id): o índice implícito do UNIQUE (review_id, item_code)
-- já cobre filtros por review_id (coluna líder) — evita overhead de escrita redundante.

alter table public.prisma_checklist_item enable row level security;

create policy prisma_checklist_item_member on public.prisma_checklist_item
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));
