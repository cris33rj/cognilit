-- ============================================================
-- Marco 2 / Fatia 1 — Ingestão de PDF: document + Storage (RLS desde a origem).
-- NÃO processa texto (Fatia 2). Edge/Action só valida/persiste/enfileira (§VIII).
-- ============================================================

-- enum de estado de processamento do PDF (máquina de estados — data-model.md)
create type document_status as enum (
  'queued', 'processing', 'text_ready', 'partial', 'failed'
);

-- ---------- document (PDF anexado a um estudo — US1) ----------
create table public.document (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review (id) on delete cascade,
  record_id uuid not null references public.record (id) on delete cascade,
  storage_path text not null,
  filename text not null,
  byte_size integer not null check (byte_size > 0),
  page_count integer,                    -- null até processar (Fatia 2)
  processing_status document_status not null default 'queued',
  created_at timestamptz not null default now()
);
create index document_review_idx on public.document (review_id, created_at desc);
create index document_record_idx on public.document (record_id);

alter table public.document enable row level security;

-- Leitura/escrita por membros da Revisão (escrita direta de status só pelo worker
-- service-role na Fatia 2; aqui o insert vem da RPC SECURITY DEFINER).
create policy document_select_member on public.document
  for select using (public.is_review_member(review_id));
create policy document_insert_member on public.document
  for insert with check (public.is_review_member(review_id));

-- ---------- Storage: bucket privado + policies por path ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- path: review/<review_id>/record/<record_id>/<document_id>.pdf
-- foldername(name) => {review, <review_id>, record, <record_id>}; [2] = review_id (R7).
create policy pdfs_select_member on storage.objects
  for select using (
    bucket_id = 'pdfs'
    and public.is_review_member(((storage.foldername(name))[2])::uuid)
  );
create policy pdfs_insert_member on storage.objects
  for insert with check (
    bucket_id = 'pdfs'
    and public.is_review_member(((storage.foldername(name))[2])::uuid)
  );
create policy pdfs_delete_member on storage.objects
  for delete using (
    bucket_id = 'pdfs'
    and public.is_review_member(((storage.foldername(name))[2])::uuid)
  );
