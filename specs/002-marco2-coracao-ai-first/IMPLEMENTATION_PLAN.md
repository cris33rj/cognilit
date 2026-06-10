# Fatia 1 — Ingestão de PDF (Storage + anexo no workbench) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** apenas a **Fatia 1** do `slicing.md` (US1-A). Entrega anexar PDFs a um
> estudo no **modo Texto completo do workbench**, guardados em Storage escopado por
> Revisão, com validação síncrona e enfileiramento do job `pdf_text_pipeline` (estado
> `queued`). **NÃO** processa texto (isso é a Fatia 2). Não refragmenta a triagem
> (Princípio V): o upload é afordância **aditiva** do modo `full_text` existente.

**Goal:** Pesquisador anexa PDFs a um estudo (`record` com `corpus_state ∈
{included_ts, included_ft}`) pelo modo Texto completo; o arquivo é validado
(MIME + tamanho ≤ 50 MiB), guardado no Storage escopado por Revisão (RLS por path) e um
job `pdf_text_pipeline` é enfileirado — tudo sem parsing pesado inline (§VIII/FR-005).

**Architecture:** Server Action fina (`attachPdf`) sobre uma função de lib testável
(`attachPdfDocument`) que valida (pura), faz upload server-side ao bucket privado `pdfs`
e chama a RPC atômica `create_pdf_pipeline_job` (security definer) — espelhando o padrão
Marco 1 `enqueueScreeningBatch`→`enqueueScreeningJob`/`create_screening_job`. Frontend:
um `DocumentsPanel` (upload + lista + polling de status, espelhando `JobProgress`)
renderizado ao lado da fila **só no modo `full_text`**, espelhando o painel `RecordDetail`
do modo `title_abstract`.

**Tech Stack:** Next.js 14 App Router (Server Actions), Supabase (Postgres + RLS +
Storage + RPC security definer), TanStack Query (polling), Vitest (unit/integração),
Playwright (e2e). Sem novas dependências nesta fatia.

**Pré-requisitos do executor:**
- Supabase local rodando (`supabase start`); `npm run gen:types` requer o DB local.
- Branch de trabalho: `build/002-marco2-coracao-ai-first/1-ingestao-pdf` (criado via
  `superpowers:using-git-worktrees` antes de executar).
- Migrations atuais vão até `0011`; esta fatia adiciona **0012**.
- Enums relevantes (verificados): `corpus_state` inclui `included_ts`/`included_ft`;
  `job_type` = (`import_parse`,`ai_screening_batch`) — ALTER aditivo aqui;
  `audit_actor_type` = (`human`,`ai`,`system`); helper `public.is_review_member(uuid)`
  (SECURITY DEFINER) já existe (0001).

---

## File Structure

**Criar:**
- `supabase/migrations/0012_documents_storage.sql` — enum `document_status`, tabela
  `document` + RLS, bucket `pdfs` + policies em `storage.objects`, `ALTER TYPE job_type`,
  RPC `create_pdf_pipeline_job`.
- `src/lib/documents/validate.ts` — validação pura (MIME/tamanho) + constantes.
- `src/lib/documents/attach.ts` — `attachPdfDocument(deps, input)` (lib testável).
- `src/lib/documents/queries.ts` — `listDocuments(reviewId, recordId)`.
- `src/components/documents/DocumentsPanel.tsx` — upload + lista + polling de status.
- `tests/unit/documents/validate.test.ts`
- `tests/unit/documents/documents-panel.test.tsx`
- `tests/integration/rls.documents.test.ts`
- `tests/integration/documents.attach.test.ts`
- `tests/e2e/documents.spec.ts`
- `tests/fixtures/sample.pdf` — PDF mínimo válido (header + EOF).

**Modificar:**
- `app/reviews/[reviewId]/workbench/actions.ts` — Server Actions `attachPdf` +
  `fetchDocuments` (finas, sobre as libs).
- `src/components/workbench/ScreeningQueue.tsx` — props opcionais `loadDocuments`/
  `onAttachPdf`; renderizar `DocumentsPanel` ao lado da fila no `full_text`.
- `app/reviews/[reviewId]/workbench/page.tsx` — passar os novos props/ações no `full_text`.
- `next.config.*` — `serverActions.bodySizeLimit` para aceitar upload ≤ 50 MiB.

---

## Task 1: Migração 0012 — tabela `document` + enum + RLS + Storage

**Files:**
- Create: `supabase/migrations/0012_documents_storage.sql`
- Test: `tests/integration/rls.documents.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/rls.documents.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { serviceClient, signUpUser } from "./helpers/supabase";

async function newReview(client: Awaited<ReturnType<typeof signUpUser>>["client"], title: string) {
  const { data, error } = await client.rpc("create_review", { p_title: title });
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function seedRecord(reviewId: string, corpusState: string): Promise<string> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo PDF" },
      corpus_state: corpusState,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

describe("RLS — document (Fatia 1, SC-011)", () => {
  let aClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let bClient: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewA: string;
  let recordA: string;
  let docId: string;

  beforeAll(async () => {
    const s = Date.now();
    aClient = (await signUpUser(`doca_${s}@example.com`, "senha-teste-123")).client;
    bClient = (await signUpUser(`docb_${s}@example.com`, "senha-teste-123")).client;
    reviewA = await newReview(aClient, "Revisão A");
    recordA = await seedRecord(reviewA, "included_ft");

    // Insere um document diretamente (service role) para testar leitura sob RLS.
    const svc = serviceClient();
    const { data, error } = await svc
      .from("document")
      .insert({
        review_id: reviewA,
        record_id: recordA,
        storage_path: `review/${reviewA}/record/${recordA}/seed.pdf`,
        filename: "seed.pdf",
        byte_size: 1234,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    docId = data.id;
  });

  it("membro da Revisão lê o document", async () => {
    const { data, error } = await aClient
      .from("document")
      .select("id, processing_status")
      .eq("id", docId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.processing_status).toBe("queued");
  });

  it("não-membro NÃO lê o document de outra Revisão", async () => {
    const { data } = await bClient
      .from("document")
      .select("id")
      .eq("id", docId)
      .maybeSingle();
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/rls.documents.test.ts`
Expected: FAIL — `relation "public.document" does not exist`.

- [ ] **Step 3: Write the migration (schema + RLS + Storage)**

```sql
-- supabase/migrations/0012_documents_storage.sql
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
```

- [ ] **Step 4: Reset DB and run test to verify it passes**

Run: `supabase db reset && npm test -- tests/integration/rls.documents.test.ts`
Expected: PASS (both tests green).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_documents_storage.sql tests/integration/rls.documents.test.ts
git commit -m "feat(002-f1): document table + Storage bucket with RLS (US1)"
```

---

## Task 2: Migração 0012 — `ALTER job_type` + RPC `create_pdf_pipeline_job`

**Files:**
- Modify: `supabase/migrations/0012_documents_storage.sql` (append)
- Modify: `src/types/database.ts` (regenerated)
- Test: `tests/integration/documents.attach.test.ts` (RPC portion)

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/documents.attach.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { serviceClient, signUpUser } from "./helpers/supabase";

async function newReview(client: Awaited<ReturnType<typeof signUpUser>>["client"], title: string) {
  const { data, error } = await client.rpc("create_review", { p_title: title });
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function seedRecord(reviewId: string, corpusState: string): Promise<string> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("record")
    .insert({ review_id: reviewId, source_format: "ris", raw: {}, metadata: { title: "Estudo" }, corpus_state: corpusState })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

describe("RPC create_pdf_pipeline_job (Fatia 1, FR-001/005)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recordFt: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`rpc_${s}@example.com`, "senha-teste-123")).client;
    reviewId = await newReview(owner, "RPC Revisão");
    recordFt = await seedRecord(reviewId, "included_ft");
  });

  it("cria document(queued) + job(pdf_text_pipeline) + job_item + audit_entry", async () => {
    const docId = crypto.randomUUID();
    const { data, error } = await owner.rpc("create_pdf_pipeline_job", {
      p_review_id: reviewId,
      p_record_id: recordFt,
      p_document_id: docId,
      p_storage_path: `review/${reviewId}/record/${recordFt}/${docId}.pdf`,
      p_filename: "estudo.pdf",
      p_byte_size: 4096,
    });
    expect(error).toBeNull();
    expect(data.job_id).toBeTruthy();
    expect(data.document_id).toBe(docId);

    const svc = serviceClient();
    const doc = await svc.from("document").select("processing_status, record_id").eq("id", docId).single();
    expect(doc.data!.processing_status).toBe("queued");

    const job = await svc.from("job").select("type, status").eq("id", data.job_id).single();
    expect(job.data!.type).toBe("pdf_text_pipeline");
    expect(job.data!.status).toBe("queued");

    const items = await svc.from("job_item").select("payload").eq("job_id", data.job_id);
    expect(items.data!.length).toBe(1);
    expect((items.data![0].payload as { document_id: string }).document_id).toBe(docId);

    const audit = await svc.from("audit_entry").select("action").eq("review_id", reviewId).eq("entity", "document");
    expect((audit.data ?? []).some((a) => a.action === "attach_pdf")).toBe(true);
  });

  it("rejeita record que NÃO passou em Título/Resumo (corpus_state inválido)", async () => {
    const recActive = await seedRecord(reviewId, "active");
    const docId = crypto.randomUUID();
    const { error } = await owner.rpc("create_pdf_pipeline_job", {
      p_review_id: reviewId, p_record_id: recActive, p_document_id: docId,
      p_storage_path: `review/${reviewId}/record/${recActive}/${docId}.pdf`,
      p_filename: "x.pdf", p_byte_size: 10,
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/documents.attach.test.ts`
Expected: FAIL — `function public.create_pdf_pipeline_job(...) does not exist`.

- [ ] **Step 3: Append the ALTER + RPC to the migration**

```sql
-- (append ao final de supabase/migrations/0012_documents_storage.sql)

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
```

> **Note (executor):** `alter type ... add value` não pode rodar dentro do mesmo bloco que
> *usa* o novo valor. Aqui o valor só é usado em tempo de execução da RPC (depois do
> commit da migração), então é seguro. Se `supabase db reset` reclamar, mova o `ALTER TYPE`
> para o topo do arquivo (antes das tabelas).

- [ ] **Step 4: Regenerate types, reset, run test**

Run: `supabase db reset && npm run gen:types && npm test -- tests/integration/documents.attach.test.ts`
Expected: PASS (both tests green); `src/types/database.ts` now includes `document`,
`document_status`, `create_pdf_pipeline_job`, and `pdf_text_pipeline` in `job_type`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_documents_storage.sql src/types/database.ts tests/integration/documents.attach.test.ts
git commit -m "feat(002-f1): create_pdf_pipeline_job RPC + pdf_text_pipeline job type (FR-005)"
```

---

## Task 3: Validação pura de PDF (`validate.ts`)

**Files:**
- Create: `src/lib/documents/validate.ts`
- Test: `tests/unit/documents/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/documents/validate.test.ts
import { describe, it, expect } from "vitest";
import { validatePdfUpload, MAX_PDF_BYTES, MAX_PDF_PAGES } from "@/lib/documents/validate";

function pdfBytes(body = "1 0 obj<<>>endobj"): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${body}\n%%EOF\n`);
}

describe("validatePdfUpload (FR-003, A4)", () => {
  it("aceita um PDF com header e trailer válidos dentro do limite", () => {
    const bytes = pdfBytes();
    const res = validatePdfUpload({ bytes, byteSize: bytes.byteLength });
    expect(res.ok).toBe(true);
  });

  it("rejeita arquivo sem header %PDF-", () => {
    const bytes = new TextEncoder().encode("not a pdf\n%%EOF");
    const res = validatePdfUpload({ bytes, byteSize: bytes.byteLength });
    expect(res.ok).toBe(false);
  });

  it("rejeita arquivo truncado (sem %%EOF)", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj");
    const res = validatePdfUpload({ bytes, byteSize: bytes.byteLength });
    expect(res.ok).toBe(false);
  });

  it("rejeita arquivo acima do teto de 50 MiB", () => {
    const bytes = pdfBytes();
    const res = validatePdfUpload({ bytes, byteSize: MAX_PDF_BYTES + 1 });
    expect(res.ok).toBe(false);
  });

  it("expõe o teto de páginas para a Fatia 2", () => {
    expect(MAX_PDF_PAGES).toBe(300);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/documents/validate.test.ts`
Expected: FAIL — module `@/lib/documents/validate` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/documents/validate.ts
/** Teto de bytes por PDF (50 MiB — A4). Protege o worker e limita custo de OCR. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Teto de páginas por PDF (A4). Aplicado na Fatia 2 (page_count só existe após
 *  abrir o PDF no worker); declarado aqui como contrato único. */
export const MAX_PDF_PAGES = 300;

export type PdfValidation = { ok: true } | { ok: false; error: string };

const HEADER = new TextEncoder().encode("%PDF-");

function startsWithHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < HEADER.length) return false;
  for (let i = 0; i < HEADER.length; i++) if (bytes[i] !== HEADER[i]) return false;
  return true;
}

function hasEofTrailer(bytes: Uint8Array): boolean {
  // %%EOF aparece nos últimos ~1KB de um PDF íntegro.
  const tail = bytes.subarray(Math.max(0, bytes.byteLength - 1024));
  return new TextDecoder("latin1").decode(tail).includes("%%EOF");
}

/** Validação SÍNCRONA e leve (sem parsing pesado, §VIII/FR-005): MIME por magic
 *  bytes, tamanho e integridade estrutural básica. Não conta páginas (Fatia 2). */
export function validatePdfUpload(input: {
  bytes: Uint8Array;
  byteSize: number;
}): PdfValidation {
  if (input.byteSize <= 0) return { ok: false, error: "Arquivo vazio." };
  if (input.byteSize > MAX_PDF_BYTES)
    return { ok: false, error: "PDF acima do limite de 50 MB." };
  if (!startsWithHeader(input.bytes))
    return { ok: false, error: "Arquivo não é um PDF válido." };
  if (!hasEofTrailer(input.bytes))
    return { ok: false, error: "PDF corrompido ou incompleto." };
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/documents/validate.test.ts`
Expected: PASS (5 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/validate.ts tests/unit/documents/validate.test.ts
git commit -m "feat(002-f1): synchronous PDF validation (MIME/size, FR-003/A4)"
```

---

## Task 4: Função de lib `attachPdfDocument` (validar + upload + RPC)

**Files:**
- Create: `src/lib/documents/attach.ts`
- Test: `tests/integration/documents.attach.test.ts` (append novo describe)

- [ ] **Step 1: Write the failing test (append ao arquivo da Task 2)**

```ts
// (append em tests/integration/documents.attach.test.ts)
import { attachPdfDocument } from "@/lib/documents/attach";
import { anonClient } from "./helpers/supabase";

describe("attachPdfDocument — validar + upload Storage + RPC (FR-001/002/003)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let recordFt: string;

  function pdf(): Uint8Array {
    return new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n");
  }

  beforeAll(async () => {
    const s = Date.now();
    const u = await signUpUser(`att_${s}@example.com`, "senha-teste-123");
    owner = u.client;
    reviewId = await newReview(owner, "Anexo Revisão");
    recordFt = await seedRecord(reviewId, "included_ft");
  });

  it("guarda o PDF e enfileira o job (estado queued)", async () => {
    const res = await attachPdfDocument(
      { supabase: owner },
      { reviewId, recordId: recordFt, filename: "estudo.pdf", bytes: pdf() },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const svc = serviceClient();
    const doc = await svc.from("document").select("storage_path, processing_status").eq("id", res.documentId).single();
    expect(doc.data!.processing_status).toBe("queued");
    expect(doc.data!.storage_path).toContain(`review/${reviewId}/record/${recordFt}/`);
    // O objeto existe no Storage:
    const obj = await svc.storage.from("pdfs").download(doc.data!.storage_path);
    expect(obj.data).not.toBeNull();
  });

  it("rejeita arquivo não-PDF sem persistir document (FR-003)", async () => {
    const before = (await serviceClient().from("document").select("id").eq("review_id", reviewId)).data?.length ?? 0;
    const res = await attachPdfDocument(
      { supabase: owner },
      { reviewId, recordId: recordFt, filename: "x.txt", bytes: new TextEncoder().encode("hello") },
    );
    expect(res.ok).toBe(false);
    const after = (await serviceClient().from("document").select("id").eq("review_id", reviewId)).data?.length ?? 0;
    expect(after).toBe(before);
  });

  it("não-membro não consegue ler o objeto no Storage (SC-011)", async () => {
    const res = await attachPdfDocument(
      { supabase: owner },
      { reviewId, recordId: recordFt, filename: "estudo2.pdf", bytes: pdf() },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const stranger = anonClient();
    const { data } = await stranger.storage.from("pdfs").download(
      `review/${reviewId}/record/${recordFt}/${res.documentId}.pdf`,
    );
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/documents.attach.test.ts`
Expected: FAIL — module `@/lib/documents/attach` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/documents/attach.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePdfUpload } from "./validate";

export interface AttachDeps {
  supabase: SupabaseClient;
}

export interface AttachInput {
  reviewId: string;
  recordId: string;
  filename: string;
  bytes: Uint8Array;
}

export type AttachResult =
  | { ok: true; documentId: string; jobId: string }
  | { ok: false; error: string };

/**
 * Valida (síncrono, §VIII), envia o binário ao bucket privado `pdfs` (path escopado
 * por Revisão, R7) e chama a RPC atômica que cria document(queued)+job+job_item+audit.
 * NÃO processa texto. O `supabase` injetado carrega a sessão do membro (RLS no Storage
 * e na RPC). Testável com client de membro.
 */
export async function attachPdfDocument(
  deps: AttachDeps,
  input: AttachInput,
): Promise<AttachResult> {
  const valid = validatePdfUpload({ bytes: input.bytes, byteSize: input.bytes.byteLength });
  if (!valid.ok) return { ok: false, error: valid.error };

  const documentId = crypto.randomUUID();
  const storagePath = `review/${input.reviewId}/record/${input.recordId}/${documentId}.pdf`;

  const up = await deps.supabase.storage
    .from("pdfs")
    .upload(storagePath, input.bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) return { ok: false, error: up.error.message };

  const { data, error } = await deps.supabase.rpc("create_pdf_pipeline_job", {
    p_review_id: input.reviewId,
    p_record_id: input.recordId,
    p_document_id: documentId,
    p_storage_path: storagePath,
    p_filename: input.filename,
    p_byte_size: input.bytes.byteLength,
  });
  if (error) {
    // Limpeza: remove o objeto órfão para não deixar nada parcial (FR-003).
    await deps.supabase.storage.from("pdfs").remove([storagePath]);
    return { ok: false, error: error.message };
  }

  const out = data as { document_id: string; job_id: string };
  return { ok: true, documentId: out.document_id, jobId: out.job_id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/documents.attach.test.ts`
Expected: PASS (all describes green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/attach.ts tests/integration/documents.attach.test.ts
git commit -m "feat(002-f1): attachPdfDocument — validate + Storage upload + enqueue (US1)"
```

---

## Task 5: Query `listDocuments`

**Files:**
- Create: `src/lib/documents/queries.ts`
- Test: `tests/integration/documents.attach.test.ts` (append) — reusa o setup

- [ ] **Step 1: Write the failing test (append)**

```ts
// (append em tests/integration/documents.attach.test.ts)
import { listDocuments } from "@/lib/documents/queries";

describe("listDocuments (FR-004)", () => {
  it("lista os PDFs de um estudo com seu estado de processamento", async () => {
    const s = Date.now();
    const owner2 = (await signUpUser(`list_${s}@example.com`, "senha-teste-123")).client;
    const rev = await newReview(owner2, "Lista Revisão");
    const rec = await seedRecord(rev, "included_ft");
    await attachPdfDocument(
      { supabase: owner2 },
      { reviewId: rev, recordId: rec, filename: "a.pdf", bytes: new TextEncoder().encode("%PDF-1.4\nx\n%%EOF\n") },
    );
    const docs = await listDocuments({ supabase: owner2 }, rev, rec);
    expect(docs.length).toBe(1);
    expect(docs[0].filename).toBe("a.pdf");
    expect(docs[0].processing_status).toBe("queued");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/documents.attach.test.ts`
Expected: FAIL — module `@/lib/documents/queries` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/documents/queries.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DocumentRow {
  id: string;
  filename: string;
  byte_size: number;
  processing_status: "queued" | "processing" | "text_ready" | "partial" | "failed";
  created_at: string;
}

/** PDFs de um estudo, mais novos primeiro (RLS escopa por membro). */
export async function listDocuments(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordId: string,
): Promise<DocumentRow[]> {
  const { data, error } = await deps.supabase
    .from("document")
    .select("id, filename, byte_size, processing_status, created_at")
    .eq("review_id", reviewId)
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DocumentRow[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/documents.attach.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/queries.ts tests/integration/documents.attach.test.ts
git commit -m "feat(002-f1): listDocuments query (FR-004)"
```

---

## Task 6: Server Actions `attachPdf` + `fetchDocuments` + bodySizeLimit

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/actions.ts`
- Modify: `next.config.mjs` (ou `next.config.js`/`.ts` — usar o existente)

> Server Actions não são testadas em unidade (dependem de contexto de request; ver
> memória do projeto). São finas sobre as libs já testadas; cobertas pelo e2e (Task 9).

- [ ] **Step 1: Add the bodySizeLimit config**

O `next.config.mjs` da raiz já tem um bloco `experimental` com `staleTimes`. **Mescle**
`serverActions.bodySizeLimit` nesse bloco (não substitua) — o default 1 MB é insuficiente
para PDFs ≤ 50 MiB. Resultado:

```js
// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Disable client-side router cache so server components always re-render
    // on soft navigation. Needed for dynamic pages like /reviews/[reviewId].
    staleTimes: {
      dynamic: 0,
    },
    serverActions: {
      bodySizeLimit: "51mb", // aceita upload de PDF ≤ 50 MiB (A4)
    },
  },
};

export default nextConfig;
```

- [ ] **Step 2: Add the Server Actions**

Acrescente ao topo de imports de `app/reviews/[reviewId]/workbench/actions.ts`:

```ts
import { attachPdfDocument } from "@/lib/documents/attach";
import { listDocuments } from "@/lib/documents/queries";
```

Acrescente as duas ações (ao final do arquivo), espelhando o padrão `enqueueScreeningBatch`:

```ts
// ---- Ingestão de PDF (Fatia 1 / US1) — anexo no modo Texto completo ----
export async function attachPdf(reviewId: string, formData: FormData) {
  const { supabase } = await requireMember(reviewId);
  const recordId = String(formData.get("recordId") ?? "");
  const file = formData.get("file");
  if (!recordId || !(file instanceof File)) {
    return { ok: false as const, error: "Arquivo ou estudo ausente." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const res = await attachPdfDocument(
    { supabase },
    { reviewId, recordId, filename: file.name, bytes },
  );
  if (res.ok) revalidatePath(`/reviews/${reviewId}/workbench`);
  return res;
}

export async function fetchDocuments(reviewId: string, recordId: string) {
  const { supabase } = await requireMember(reviewId);
  return listDocuments({ supabase }, reviewId, recordId);
}
```

- [ ] **Step 3: Verify type-check passes**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add app/reviews/[reviewId]/workbench/actions.ts next.config.mjs
git commit -m "feat(002-f1): attachPdf/fetchDocuments server actions + bodySizeLimit"
```

---

## Task 7: Componente `DocumentsPanel` (upload + lista + polling)

**Files:**
- Create: `src/components/documents/DocumentsPanel.tsx`
- Test: `tests/unit/documents/documents-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/documents/documents-panel.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("DocumentsPanel (FR-004)", () => {
  it("lista os PDFs do estudo com seu estado", async () => {
    const loadDocuments = vi.fn().mockResolvedValue([
      { id: "d1", filename: "estudo.pdf", byte_size: 2048, processing_status: "queued", created_at: "2026-06-09T00:00:00Z" },
    ]);
    const onAttach = vi.fn();
    wrap(
      <DocumentsPanel reviewId="r1" recordId="rec1" loadDocuments={loadDocuments} onAttach={onAttach} />,
    );
    expect(await screen.findByText("estudo.pdf")).toBeInTheDocument();
    expect(screen.getByText(/enfileirado/i)).toBeInTheDocument();
  });

  it("mostra mensagem quando o estudo não tem PDF", async () => {
    const loadDocuments = vi.fn().mockResolvedValue([]);
    wrap(
      <DocumentsPanel reviewId="r1" recordId="rec1" loadDocuments={loadDocuments} onAttach={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/nenhum pdf anexado/i)).toBeInTheDocument());
  });

  it("desabilita o anexo quando nenhum estudo está selecionado", () => {
    wrap(
      <DocumentsPanel reviewId="r1" recordId={null} loadDocuments={vi.fn()} onAttach={vi.fn()} />,
    );
    expect(screen.getByText(/selecione um registro/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/documents/documents-panel.test.tsx`
Expected: FAIL — module `@/components/documents/DocumentsPanel` not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/documents/DocumentsPanel.tsx
"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocumentRow } from "@/lib/documents/queries";

const STATUS_LABEL: Record<DocumentRow["processing_status"], string> = {
  queued: "enfileirado",
  processing: "processando",
  text_ready: "texto pronto",
  partial: "parcial",
  failed: "falhou",
};

const PENDING = new Set(["queued", "processing"]);

export interface DocumentsPanelProps {
  reviewId: string;
  recordId: string | null;
  loadDocuments: (reviewId: string, recordId: string) => Promise<DocumentRow[]>;
  onAttach: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Afordância de anexo de PDF no modo Texto completo (US1). Estende o workbench sem
 * refragmentar a triagem (Princípio V). Lista + polling de status enquanto há item
 * não-terminal (espelha JobProgress). SEM vocabulário de IA (não é sugestão).
 */
export function DocumentsPanel({ reviewId, recordId, loadDocuments, onAttach }: DocumentsPanelProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const docs = useQuery({
    queryKey: ["documents", reviewId, recordId],
    queryFn: () => loadDocuments(reviewId, recordId as string),
    enabled: !!recordId,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((d) => PENDING.has(d.processing_status)) ? 1000 : false,
  });

  async function handleFile(file: File) {
    if (!recordId) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("recordId", recordId);
      fd.set("file", file);
      const res = await onAttach(fd);
      if (!res.ok) setError(res.error ?? "Falha ao anexar o PDF.");
      else await qc.invalidateQueries({ queryKey: ["documents", reviewId, recordId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao anexar o PDF.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <aside className="panel flex w-[360px] shrink-0 flex-col gap-3 self-start" aria-label="PDFs do estudo">
      <h2 className="panel-title">PDFs do estudo</h2>
      {!recordId ? (
        <p className="text-sm text-ink-faint">Selecione um registro para anexar PDFs.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              aria-label="Anexar PDF"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="text-sm"
            />
            {busy && <span className="text-xs text-ink-faint">enviando…</span>}
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {docs.isLoading ? (
            <p className="text-sm text-ink-faint">Carregando…</p>
          ) : (docs.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-faint">Nenhum PDF anexado.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm" aria-label="Lista de PDFs">
              {(docs.data ?? []).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-ink">{d.filename}</span>
                  <span className="shrink-0 text-xs text-ink-soft" aria-live="polite">
                    {STATUS_LABEL[d.processing_status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/documents/documents-panel.test.tsx`
Expected: PASS (3 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/components/documents/DocumentsPanel.tsx tests/unit/documents/documents-panel.test.tsx
git commit -m "feat(002-f1): DocumentsPanel — upload + list + status polling (FR-004)"
```

---

## Task 8: Integrar o `DocumentsPanel` no modo `full_text` do `ScreeningQueue`

**Files:**
- Modify: `src/components/workbench/ScreeningQueue.tsx`
- Test: `tests/unit/workbench/screening-queue.test.tsx` (append)

> Espelha o painel `RecordDetail` do modo `title_abstract`: props opcionais de
> documentos e um painel lateral renderizado **só no `full_text`**. Não altera a fila
> nem a lógica de triagem (Princípio V).

- [ ] **Step 1: Write the failing test (append ao describe existente)**

O arquivo `tests/unit/workbench/screening-queue.test.tsx` já tem o helper `renderQueue(over)`
(monta `ScreeningQueue` com `QueryClientProvider`; `over` sobrescreve props). Os props
`loadDocuments`/`onAttachPdf` são opcionais, então `renderQueue()` segue válido. Acrescente
estes dois casos ao final do `describe("ScreeningQueue (US4)", …)`:

```tsx
  it("Fatia 1 — full_text renderiza o painel de PDFs do estudo (US1)", async () => {
    renderQueue({
      stage: "full_text",
      loadDocuments: vi.fn().mockResolvedValue([]),
      onAttachPdf: vi.fn().mockResolvedValue({ ok: true }),
    });
    expect(await screen.findByText("PDFs do estudo")).toBeInTheDocument();
    // Sem PDFs ainda, mas com um registro focado (r1): mensagem de vazio.
    expect(await screen.findByText(/nenhum pdf anexado/i)).toBeInTheDocument();
  });

  it("Fatia 1 — title_abstract NÃO mostra o painel de PDFs", async () => {
    renderQueue({ stage: "title_abstract" });
    await screen.findByText("Estudo Alpha");
    expect(screen.queryByText("PDFs do estudo")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/workbench/screening-queue.test.tsx`
Expected: FAIL — "PDFs do estudo" não encontrado (painel ainda não existe).

- [ ] **Step 3: Add the props and render the panel**

Em `src/components/workbench/ScreeningQueue.tsx`:

1. Adicione o import:

```tsx
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";
import type { DocumentRow } from "@/lib/documents/queries";
```

2. Estenda `ScreeningQueueProps` com dois props **opcionais** (não quebram chamadas atuais):

```tsx
  loadDocuments?: (reviewId: string, recordId: string) => Promise<DocumentRow[]>;
  onAttachPdf?: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
```

3. Receba-os na desestruturação de props da função `ScreeningQueue` (junto de
   `loadDetail`): `, loadDocuments, onAttachPdf`.

4. No `return`, dentro do contêiner da grade
   (`<div className={stage === "title_abstract" ? "flex items-start gap-4" : undefined}>`),
   troque esse `className` para também aplicar o layout lado-a-lado no `full_text`:

```tsx
        className={
          stage === "title_abstract" || stage === "full_text"
            ? "flex items-start gap-4"
            : undefined
        }
```

   e ajuste a `className` da `<div ref={parentRef} ...>` para ocupar o espaço flexível
   também no `full_text`:

```tsx
          className={`h-[60vh] overflow-auto rounded border focus:outline focus:outline-2 focus:outline-accent ${
            stage === "title_abstract" || stage === "full_text" ? "min-w-0 flex-1" : ""
          }`}
```

5. Logo após o bloco `{stage === "title_abstract" && (<RecordDetail ... />)}`, acrescente:

```tsx
        {stage === "full_text" && loadDocuments && onAttachPdf && (
          <DocumentsPanel
            reviewId={reviewId}
            recordId={focusedRecordId}
            loadDocuments={loadDocuments}
            onAttach={onAttachPdf}
          />
        )}
```

> `focusedRecordId` já existe no componente (linha do `const focusedRecordId = ...`).
> Garanta que ele é computado independente do estágio (hoje é; o `useQuery` de detalhe
> é que está restrito a `title_abstract`). Nenhuma mudança na lógica de triagem.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/workbench/screening-queue.test.tsx`
Expected: PASS (novos casos verdes; casos existentes seguem verdes).

- [ ] **Step 5: Commit**

```bash
git add src/components/workbench/ScreeningQueue.tsx tests/unit/workbench/screening-queue.test.tsx
git commit -m "feat(002-f1): render DocumentsPanel in full_text mode (Princípio V preserved)"
```

---

## Task 9: Passar as ações no `workbench/page.tsx`

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/page.tsx`

- [ ] **Step 1: Import the new actions**

No bloco de import de `./actions`, acrescente `attachPdf` e `fetchDocuments`:

```tsx
import {
  decideFuzzy,
  reverseDedup,
  fetchExactRemovals,
  fetchFuzzyCandidates,
  fetchScreeningQueue,
  fetchExclusionReasons,
  fetchReasonUsage,
  addExclusionReason,
  removeExclusionReason,
  decideScreening,
  reverseScreening,
  fetchRecordDetail,
  attachPdf,
  fetchDocuments,
} from "./actions";
```

- [ ] **Step 2: Wire the props into the ScreeningQueue render**

No JSX `<ScreeningQueue ... />` (ramo `title_abstract || full_text`), acrescente os dois props:

```tsx
            loadDetail={fetchRecordDetail}
            loadDocuments={fetchDocuments}
            onAttachPdf={attachPdf.bind(null, reviewId)}
```

- [ ] **Step 3: Verify type-check + lint pass**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/reviews/[reviewId]/workbench/page.tsx
git commit -m "feat(002-f1): wire attachPdf/fetchDocuments into full_text workbench"
```

---

## Task 10: E2E — anexar PDF no modo Texto completo

**Files:**
- Create: `tests/e2e/documents.spec.ts`
- Create: `tests/fixtures/sample.pdf`

> Espelha o padrão de `tests/e2e/screening.spec.ts` (login + criar Revisão + navegar ao
> workbench). Verifica o caminho feliz mínimo de US1-A: anexar um PDF a um estudo
> `included_ft` e vê-lo listado com estado `enfileirado`.

- [ ] **Step 1: Create the minimal valid PDF fixture**

Crie `tests/fixtures/sample.pdf` com este conteúdo (header + objeto + trailer + `%%EOF`):

```text
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
%%EOF
```

- [ ] **Step 2: Write the failing e2e test**

Espelha `setupScreeningCorpus` de `tests/e2e/screening.spec.ts` (signup → criar Revisão →
importar `sample.ris` → worker) e o passo de incluir 1 registro no T/R para que ele apareça
no modo `full_text` (a fila de TC só mostra `included_ts`).

```ts
// tests/e2e/documents.spec.ts
import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

async function setupCorpus(page: Page): Promise<string> {
  const email = `e2e_docs_${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-teste-123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/reviews/);

  await page.getByRole("link", { name: "Nova Revisão" }).click();
  await page.getByLabel("Título da Revisão").fill("Revisão e2e PDFs");
  await page.getByRole("button", { name: "Criar Revisão" }).click();
  await expect(page).toHaveURL(/\/reviews\/[0-9a-f-]+$/);
  const reviewId = page.url().split("/reviews/")[1]?.split("/")[0];
  if (!reviewId) throw new Error("reviewId não encontrado na URL");

  await page.getByRole("link", { name: "Importar" }).click();
  await expect(page.getByRole("heading", { name: "Workbench" })).toBeVisible();
  await page.setInputFiles("#import-file", path.resolve("tests/fixtures/import/sample.ris"));
  await expect(page.getByText("Aprendizagem ativa em sala")).toBeVisible();
  await page.getByPlaceholder("String de busca").fill("active learning e2e");
  await page.getByPlaceholder("Base consultada").fill("PubMed");
  await page.locator('input[type="date"]').fill("2026-05-30");
  await page.getByPlaceholder("Nº de hits").fill("2");
  await page.getByRole("button", { name: /confirmar importação/i }).click();
  await expect(page.getByLabel("Contadores PRISMA")).toContainText("Identificados: 2", {
    timeout: 20_000,
  });
  return reviewId;
}

test("anexa um PDF a um estudo no modo Texto completo (US1)", async ({ page }) => {
  test.setTimeout(90_000);
  const reviewId = await setupCorpus(page);

  // Incluir 1 registro no T/R para que ele entre na fila de Texto completo.
  await page.goto(`/reviews/${reviewId}/workbench?mode=title_abstract`);
  await expect(page.getByRole("grid", { name: /fila de triagem/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("row").first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("i");
  await expect(page.getByRole("button", { name: /desfazer/i }).first()).toBeVisible({
    timeout: 10_000,
  });

  // Modo Texto completo: o registro incluído está na fila e focado (focusIdx=0).
  await page.goto(`/reviews/${reviewId}/workbench?mode=full_text`);
  await expect(page.getByRole("grid", { name: /fila de triagem/i })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("PDFs do estudo")).toBeVisible({ timeout: 10_000 });

  // Anexar o PDF (input com aria-label "Anexar PDF").
  await page
    .getByLabel("Anexar PDF")
    .setInputFiles(path.resolve("tests/fixtures/sample.pdf"));

  // O PDF aparece na lista com estado de processamento visível (FR-004).
  await expect(page.getByText("sample.pdf")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(/enfileirado|processando|texto pronto/),
  ).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 3: Run test to verify it fails (then passes after wiring)**

Run: `npm run test:e2e -- documents.spec.ts`
Expected: inicialmente FAIL no setup até espelhar o helper; depois PASS no caminho de anexo.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/documents.spec.ts tests/fixtures/sample.pdf
git commit -m "test(002-f1): e2e attach PDF in full_text mode (US1)"
```

---

## Task 11: Verificação final da fatia (portões — CHECKPOINT 3)

**Files:** nenhum (verificação).

- [ ] **Step 1: Run the full quality gates**

Run: `npm run lint && npm run typecheck && npm test`
Expected: lint limpo, `tsc --noEmit` sem erros, todos os testes unit/integração verdes.

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e -- documents.spec.ts`
Expected: PASS.

- [ ] **Step 3: Confirm scope & non-regression**

Verifique manualmente:
- Nenhum arquivo do Marco 1 foi refatorado além das extensões **aditivas** previstas
  (`ScreeningQueue.tsx` props opcionais; `workbench/page.tsx` props extras;
  `workbench/actions.ts` ações novas; `next.config` bodySizeLimit). A triagem
  (`decide*`, fila, atalhos) está intacta (Princípio V).
- Migração é **0012** e os `ALTER`s de enum são aditivos.
- O gatilho síncrono **não** faz parsing pesado (só valida/persiste/enfileira; §VIII).

- [ ] **Step 4: PARAR (CHECKPOINT 3)**

Não fazer `merge`/`push`. Apresentar ao desenvolvedor: branch
`build/002-marco2-coracao-ai-first/1-ingestao-pdf`, o diff, e a saída dos portões.
Aguardar o **merge manual** antes de iniciar a Fatia 2.

---

## Self-review (cobertura da Fatia 1 vs. slicing.md)

- **FR-001** (anexar no modo Texto completo, `corpus_state ∈ {included_ts,included_ft}`):
  RPC valida estado (Task 2); UI no `full_text` (Tasks 7–9). ✅
- **FR-002** (Storage escopado por Revisão, RLS por path): bucket + policies (Task 1);
  isolamento testado (Tasks 1, 4). ✅
- **FR-003** (rejeita não-PDF/corrompido, nada parcial): `validate.ts` (Task 3); cleanup
  de órfão na falha da RPC (Task 4). ✅
- **FR-004** (estado de processamento visível): `processing_status` + `listDocuments` +
  `DocumentsPanel` com polling (Tasks 5, 7). ✅
- **FR-005** (gatilho síncrono só valida/persiste/enfileira; sem parsing inline): Action
  fina + RPC que só cria `queued` (Tasks 2, 4, 6); **A4** teto 50 MiB (Task 3). ✅
- **FR-029** (auditoria): `audit_entry action='attach_pdf'` na RPC (Task 2). ✅
- **Não-regressão / Princípio V**: extensões aditivas; triagem intocada (Task 11). ✅

**Fora desta fatia (Fatia 2):** extração de texto, `text_layer`, OCR, `page_count`,
teto de 300 páginas (aplicado ao abrir o PDF no worker), transições de
`processing_status` além de `queued`.
