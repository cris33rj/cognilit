-- ============================================================
-- Marco 3 / Fatia 5 — Exportação: infra (US5, parte 1 / FR-020..023).
-- Aditivo (não-regressão): nova tabela + enum + 1 enum ADD VALUE + bucket + RPC.
-- A RPC create_report_export_job só ENFILEIRA (§VIII); o worker Node serializa.
-- Item de job = um formato (resiliência por-formato, FR-023).
-- ============================================================

alter type job_type add value if not exists 'report_export';

-- Enum completo já na v1 (Fatia 6 reaproveita docx/pdf/prisma_* sem ALTER).
create type export_format as enum (
  'docx', 'pdf', 'md', 'bibtex', 'ris', 'prisma_svg', 'prisma_png'
);

create table public.export_artifact (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  report_id uuid references public.report(id) on delete set null,
  format export_format not null,
  storage_path text not null,
  job_id uuid references public.job(id) on delete set null,
  created_at timestamptz not null default now()
);
create index export_artifact_review_idx
  on public.export_artifact(review_id, created_at desc);

alter table public.export_artifact enable row level security;

create policy export_artifact_member on public.export_artifact
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));

-- ---------- Storage: bucket privado + policies por path (espelha 0012) ----------
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

-- path: review/<review_id>/report/<report_id>/<format>/<artifact_id>.<ext>
-- foldername(name) => {review, <review_id>, report, ...}; [2] = review_id (R8).
create policy exports_select_member on storage.objects
  for select using (
    bucket_id = 'exports'
    and public.is_review_member(((storage.foldername(name))[2])::uuid)
  );
create policy exports_insert_member on storage.objects
  for insert with check (
    bucket_id = 'exports'
    and public.is_review_member(((storage.foldername(name))[2])::uuid)
  );
create policy exports_delete_member on storage.objects
  for delete using (
    bucket_id = 'exports'
    and public.is_review_member(((storage.foldername(name))[2])::uuid)
  );

-- create_report_export_job: só enfileira. Item = um formato.
create or replace function public.create_report_export_job(
  p_review_id uuid, p_formats text[]
) returns public.job
language plpgsql security definer set search_path = public as $$
declare
  v_job public.job;
  v_fmt text;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;
  if p_formats is null or array_length(p_formats, 1) is null then
    raise exception 'no formats requested';
  end if;

  if exists (
    select 1 from public.job
    where review_id = p_review_id
      and type = 'report_export'
      and status in ('queued','running')
  ) then
    raise exception 'report export job already in progress';
  end if;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'report_export', 'queued')
  returning * into v_job;

  -- valida cada formato via cast (levanta se inválido) e cria 1 job_item por formato.
  foreach v_fmt in array p_formats loop
    perform v_fmt::export_format;
    insert into public.job_item (job_id, review_id, status, payload)
    values (v_job.id, p_review_id, 'pending', jsonb_build_object('format', v_fmt));
  end loop;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'enqueue_report_export', 'job', v_job.id,
    null, jsonb_build_object('type', 'report_export', 'formats', p_formats)
  );
  return v_job;
end; $$;
grant execute on function public.create_report_export_job(uuid, text[]) to authenticated;
