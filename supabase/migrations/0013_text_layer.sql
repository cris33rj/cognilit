-- ============================================================
-- Marco 2 / Fatia 2 — Pipeline de texto: camada de texto extraída (text_layer).
-- Escrita só pelo worker (service-role bypassa RLS); membros leem. NÃO processa
-- aqui — o worker server-side Node grava (§VIII). data-model.md §text_layer.
-- ============================================================

-- proveniência da camada (FR-008): determinística (nativo) vs OCR multimodal (ocr_ia)
create type text_origin as enum ('nativo', 'ocr_ia');

create table public.text_layer (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  document_id uuid not null references public.document (id) on delete cascade,
  page integer not null check (page >= 1),          -- 1-based (FR-008)
  char_start integer not null check (char_start >= 0),
  char_end integer not null check (char_end >= char_start),
  content text not null,                              -- idioma original (D24/FR-015)
  origin text_origin not null,
  created_at timestamptz not null default now()
);
create index text_layer_document_idx on public.text_layer (document_id, page);
create index text_layer_review_idx on public.text_layer (review_id);

alter table public.text_layer enable row level security;

-- Leitura por membros da Revisão; a escrita real é do worker service-role (bypassa RLS).
create policy text_layer_select_member on public.text_layer
  for select using (public.is_review_member(review_id));
