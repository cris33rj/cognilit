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

-- ---------- novo type de job (aditivo) ----------
alter type job_type add value if not exists 'pdf_text_pipeline';

-- ============================================================
-- RPC: create_pdf_pipeline_job — cria document(queued) + job + job_item + audit
-- (atômico, §VIII: só enfileira; nunca processa). Valida estudo (passou T/R).
-- O binário já foi enviado ao Storage pela Action ANTES desta chamada.
-- ============================================================
create or replace function public.create_pdf_pipeline_job(
  p_review_id uuid,
  p_record_id uuid,
  p_document_id uuid,
  p_storage_path text,
  p_filename text,
  p_byte_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.job;
  v_state corpus_state;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  select corpus_state into v_state
  from public.record
  where id = p_record_id and review_id = p_review_id;
  if v_state is null then
    raise exception 'record not found in review';
  end if;
  if v_state not in ('included_ts', 'included_ft') then
    raise exception 'record must have passed title/abstract screening';
  end if;

  insert into public.document (id, review_id, record_id, storage_path, filename, byte_size)
  values (p_document_id, p_review_id, p_record_id, p_storage_path, p_filename, p_byte_size);

  insert into public.job (review_id, type, status)
  values (p_review_id, 'pdf_text_pipeline', 'queued')
  returning * into v_job;

  insert into public.job_item (job_id, review_id, status, payload)
  values (v_job.id, p_review_id, 'pending', jsonb_build_object('document_id', p_document_id));

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'attach_pdf', 'document', p_document_id,
    null, jsonb_build_object('job_id', v_job.id, 'filename', p_filename)
  );

  return jsonb_build_object('document_id', p_document_id, 'job_id', v_job.id);
end;
$$;

grant execute on function public.create_pdf_pipeline_job(uuid, uuid, uuid, text, text, integer) to authenticated;
