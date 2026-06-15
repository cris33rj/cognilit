# Fatia 5 — Exportação: infra + Markdown/BibTeX/RIS (US5, parte 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Contrato Sessão B**: commitar **somente** no branch isolado `build/003-marco3-saida-sintese-relatorio/5-export-light`; **nunca** merge/push para a feature ou `main`. Ao fim, **PARAR** (CHECKPOINT 3) e aguardar merge do usuário.

**Goal:** Entregar a infraestrutura de exportação do relatório (job `report_export` resiliente por-formato, bucket privado `exports`, tabela `export_artifact`) e os três serializadores leves próprios — Markdown, BibTeX e RIS — com persistência no bucket e download.

**Architecture:** Espelha o quarteto de worker Node já estabelecido nos Marcos 1–3 (`src/lib/report/{enqueue,batch-run,batch-worker,queries}.ts`). A Edge/RPC só **enfileira** (§VIII); o worker Node processa **um formato por `job_item`**, isolando falhas (FR-023). Migration aditiva (nova tabela + enum `ADD VALUE` + bucket + policies de `storage.objects` por path, espelhando `0012`). Sem LLM nesta fatia. DOCX/PDF/APA7 ficam para a Fatia 6 (mesmo job, serializadores pesados).

**Tech Stack:** TypeScript strict, Next.js 14 App Router (Server Components + server actions + route handler `runtime=nodejs`), Supabase (Postgres + RLS + Storage), Vitest (unit + integration node). Serializadores **próprios** (R4) — sem libs novas nesta fatia.

---

## Decisões de implementação herdadas (não reabrir)

- **A2 (resolvida na slicing):** o runtime de export é **worker Node server-side**, disparado pela server action (padrão `generateReport`), **não** um handler Deno. O `jobs-worker` Deno não é tocado.
- **Memory "membership-gated RPC needs user client":** a RPC `create_report_export_job` gateia em `is_review_member` → chamá-la com o **client do usuário** (`createClient`), nunca com o admin. O worker (upload no Storage + insert em `export_artifact`) usa o **admin/service client**.
- **R8 / `0012`:** bucket privado + policies em `storage.objects` derivando `review_id` de `(storage.foldername(name))[2]`. Path: `review/<review_id>/report/<report_id>/<format>/<artifact_id>.<ext>`.
- **§II (FR-022 é da Fatia 6):** nesta fatia BibTeX/RIS **não inventam** metadados ausentes — campo ausente é **omitido** da entrada, nunca preenchido com placeholder.
- **Numeração de migration:** próxima livre = **`0021`** (a última é `0020_prisma_checklist.sql`).

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `supabase/migrations/0021_report_export.sql` | enum `export_format`; tabela `export_artifact` + RLS; bucket `exports` + 3 policies de `storage.objects`; `ALTER TYPE job_type ADD VALUE 'report_export'`; RPC `create_report_export_job`. |
| `src/lib/export/serialize-bibtex.ts` | `serializeBibtex(records)` — puro. |
| `src/lib/export/serialize-ris.ts` | `serializeRis(records)` — puro. |
| `src/lib/export/serialize-markdown.ts` | `serializeMarkdown(input)` — puro (seções + características + checklist). |
| `src/lib/export/queries.ts` | `loadExportInputs`, `listIncludedFtRecordsDetail`, `loadExportArtifacts`, tipos `ExportFormat`. |
| `src/lib/export/enqueue.ts` | `enqueueReportExportJob` — chama a RPC (client do usuário), conta itens. |
| `src/lib/export/batch-worker.ts` | `processReportExportJob` — resiliente por-formato; serializa, faz upload, grava `export_artifact`. |
| `src/lib/export/batch-run.ts` | `runReportExportWorkerWith(admin, reviewId)` — itera jobs ativos. |
| `app/reviews/[reviewId]/report/actions.ts` (modificar) | server action `enqueueExport`. |
| `app/reviews/[reviewId]/report/export/[artifactId]/route.ts` | route handler GET — stream do artefato do bucket (attachment). |
| `src/components/report/ExportPanel.tsx` | UI: seleção de formatos + lista de artefatos com links de download. |
| `app/reviews/[reviewId]/report/page.tsx` (modificar) | monta `ExportPanel` com artefatos carregados. |
| `tests/unit/export/serialize-bibtex.test.ts` | unit BibTeX. |
| `tests/unit/export/serialize-ris.test.ts` | unit RIS. |
| `tests/unit/export/serialize-markdown.test.ts` | unit Markdown. |
| `tests/integration/export.test.ts` | RPC + RLS bucket/artifact + resiliência por-formato + worker. |

---

## Task 1: Migration `0021_report_export.sql` (enum + tabela + RLS + bucket + policies + RPC)

**Files:**
- Create: `supabase/migrations/0021_report_export.sql`
- Test: `tests/integration/export.test.ts`

- [ ] **Step 1: Escrever a migration**

```sql
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
```

- [ ] **Step 2: Aplicar a migration localmente**

Run: `npx supabase db reset`
Expected: reset roda todas as migrations até `0021` sem erro; termina em "Finished supabase db reset".

- [ ] **Step 3: Regenerar os tipos do banco**

Run: `npm run gen:types`
Expected: `src/types/database.ts` atualizado (sem erro); inclui `export_artifact` e `export_format`.

- [ ] **Step 4: Escrever o teste de integração da migration (RPC + RLS)**

Crie `tests/integration/export.test.ts` com o harness padrão (espelha `tests/integration/report.test.ts`):

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpUser, serviceClient } from "./helpers/supabase";

async function seedReview(
  label: string,
): Promise<{ svc: SupabaseClient; member: SupabaseClient; reviewId: string }> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const svc = serviceClient();
  const { client: member } = await signUpUser(
    `export_${label}_${stamp}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await member.rpc("create_review", {
    p_title: `Export ${label} ${stamp}`,
  });
  if (error) throw new Error(error.message);
  return { svc, member, reviewId: (review as { id: string }).id };
}

describe("Fatia 5 — migration report_export (0021)", () => {
  it("create_report_export_job enfileira 1 job_item por formato + audita", async () => {
    const { svc, member, reviewId } = await seedReview("mig");
    const { data: job, error } = await member.rpc("create_report_export_job", {
      p_review_id: reviewId,
      p_formats: ["md", "bibtex", "ris"],
    });
    expect(error).toBeNull();
    const jobId = (job as { id: string }).id;

    const { count } = await svc
      .from("job_item")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);
    expect(count).toBe(3);

    const { data: jr } = await svc
      .from("job")
      .select("type")
      .eq("id", jobId)
      .single();
    expect((jr as { type: string }).type).toBe("report_export");

    const { count: auditCount } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("entity", "job")
      .eq("entity_id", jobId);
    expect(auditCount).toBe(1);
  });

  it("create_report_export_job rejeita formato inválido", async () => {
    const { member, reviewId } = await seedReview("badfmt");
    const { error } = await member.rpc("create_report_export_job", {
      p_review_id: reviewId,
      p_formats: ["md", "xlsx"],
    });
    expect(error).not.toBeNull();
  });

  it("export_artifact: não-membro não enxerga (RLS)", async () => {
    const { svc, reviewId } = await seedReview("rls");
    await svc.from("export_artifact").insert({
      review_id: reviewId,
      format: "md",
      storage_path: `review/${reviewId}/report/_/md/x.md`,
    });
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const { client: stranger } = await signUpUser(
      `export_stranger_${stamp}@example.com`,
      "senha-teste-123",
    );
    const { data } = await stranger
      .from("export_artifact")
      .select("id")
      .eq("review_id", reviewId);
    expect(data ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Rodar os testes da migration**

Run: `npm run test -- tests/integration/export.test.ts`
Expected: 3 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0021_report_export.sql src/types/database.ts tests/integration/export.test.ts
git commit -m "feat(export): migration report_export (0021) — export_artifact + bucket + RPC (US5)"
```

---

## Task 2: `serializeBibtex` (serializador próprio, R4)

**Files:**
- Create: `src/lib/export/queries.ts` (parte: tipos + `listIncludedFtRecordsDetail`)
- Create: `src/lib/export/serialize-bibtex.ts`
- Test: `tests/unit/export/serialize-bibtex.test.ts`

> Reusa o shape bibliográfico já normalizado em `src/lib/record/queries.ts` (`RecordDetailData` + `toRecordDetail`). A query de export seleciona `included_ft` e reaproveita `toRecordDetail`.

- [ ] **Step 1: Criar `src/lib/export/queries.ts` com a query de registros**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RECORD_DETAIL_SELECT,
  toRecordDetail,
  type RawRecordRow,
  type RecordDetailData,
} from "@/lib/record/queries";

export const EXPORT_FORMATS = [
  "docx",
  "pdf",
  "md",
  "bibtex",
  "ris",
  "prisma_svg",
  "prisma_png",
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

interface Deps {
  supabase: SupabaseClient;
}

/** Registros included_ft com metadados bibliográficos ricos (FR-021). */
export async function listIncludedFtRecordsDetail(
  deps: Deps,
  reviewId: string,
): Promise<RecordDetailData[]> {
  const { data, error } = await deps.supabase
    .from("record")
    .select(RECORD_DETAIL_SELECT)
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawRecordRow[]).map(toRecordDetail);
}
```

- [ ] **Step 2: Escrever o teste unit (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { serializeBibtex } from "@/lib/export/serialize-bibtex";
import type { RecordDetailData } from "@/lib/record/queries";

const full: RecordDetailData = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Estudo sobre X",
  authors: ["Silva, Ana", "Souza, João"],
  year: 2021,
  doi: "10.1000/xyz",
  language: "pt",
  abstract: "resumo",
  journal: "Revista Brasileira",
  keywords: ["a", "b"],
  volume: "12",
  issue: "3",
  pages: "45-60",
};

describe("serializeBibtex", () => {
  it("monta uma entrada @article com os campos presentes", () => {
    const out = serializeBibtex([full]);
    expect(out).toContain("@article{");
    expect(out).toContain("title = {Estudo sobre X}");
    expect(out).toContain("author = {Silva, Ana and Souza, João}");
    expect(out).toContain("year = {2021}");
    expect(out).toContain("doi = {10.1000/xyz}");
    expect(out).toContain("journal = {Revista Brasileira}");
    expect(out).toContain("pages = {45-60}");
  });

  it("OMITE campos ausentes (não inventa — §II)", () => {
    const bare: RecordDetailData = {
      id: "22222222-2222-2222-2222-222222222222",
      title: "Sem metadados",
      authors: [],
      year: null,
      doi: null,
      language: null,
      abstract: null,
      journal: null,
      keywords: [],
      volume: null,
      issue: null,
      pages: null,
    };
    const out = serializeBibtex([bare]);
    expect(out).toContain("title = {Sem metadados}");
    expect(out).not.toContain("author =");
    expect(out).not.toContain("year =");
    expect(out).not.toContain("doi =");
  });

  it("cobre todos os registros (FR-021)", () => {
    const out = serializeBibtex([full, { ...full, id: "33333333-3333-3333-3333-333333333333" }]);
    expect((out.match(/@article\{/g) ?? []).length).toBe(2);
  });
});
```

- [ ] **Step 3: Rodar o teste (deve falhar)**

Run: `npm run test -- tests/unit/export/serialize-bibtex.test.ts`
Expected: FAIL — "Cannot find module '@/lib/export/serialize-bibtex'".

- [ ] **Step 4: Implementar `src/lib/export/serialize-bibtex.ts`**

```ts
import type { RecordDetailData } from "@/lib/record/queries";

/** Escapa chaves/contrabarras que quebrariam a entrada BibTeX. */
function clean(value: string): string {
  return value.replace(/[{}\\]/g, "").trim();
}

/** Chave de citação estável: 1º sobrenome + ano + 4 chars do id. */
function citeKey(r: RecordDetailData): string {
  const surname = (r.authors[0]?.split(",")[0] ?? "ref")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const year = r.year ?? "sd";
  return `${surname || "ref"}${year}_${r.id.slice(0, 4)}`;
}

/** Serializa registros como BibTeX. Campos ausentes são OMITIDOS (§II). */
export function serializeBibtex(records: RecordDetailData[]): string {
  return records
    .map((r) => {
      const fields: string[] = [`  title = {${clean(r.title)}}`];
      if (r.authors.length > 0)
        fields.push(`  author = {${r.authors.map(clean).join(" and ")}}`);
      if (r.year !== null) fields.push(`  year = {${r.year}}`);
      if (r.journal) fields.push(`  journal = {${clean(r.journal)}}`);
      if (r.volume) fields.push(`  volume = {${clean(r.volume)}}`);
      if (r.issue) fields.push(`  number = {${clean(r.issue)}}`);
      if (r.pages) fields.push(`  pages = {${clean(r.pages)}}`);
      if (r.doi) fields.push(`  doi = {${clean(r.doi)}}`);
      return `@article{${citeKey(r)},\n${fields.join(",\n")}\n}`;
    })
    .join("\n\n");
}
```

- [ ] **Step 5: Rodar o teste (deve passar)**

Run: `npm run test -- tests/unit/export/serialize-bibtex.test.ts`
Expected: 3 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/queries.ts src/lib/export/serialize-bibtex.ts tests/unit/export/serialize-bibtex.test.ts
git commit -m "feat(export): serializeBibtex + query de registros included_ft (US5, FR-021)"
```

---

## Task 3: `serializeRis` (serializador próprio, R4)

**Files:**
- Create: `src/lib/export/serialize-ris.ts`
- Test: `tests/unit/export/serialize-ris.test.ts`

- [ ] **Step 1: Escrever o teste unit (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { serializeRis } from "@/lib/export/serialize-ris";
import type { RecordDetailData } from "@/lib/record/queries";

const full: RecordDetailData = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Estudo sobre X",
  authors: ["Silva, Ana", "Souza, João"],
  year: 2021,
  doi: "10.1000/xyz",
  language: "pt",
  abstract: "resumo",
  journal: "Revista Brasileira",
  keywords: [],
  volume: "12",
  issue: "3",
  pages: "45-60",
};

describe("serializeRis", () => {
  it("monta um registro JOUR com tags presentes e termina em ER", () => {
    const out = serializeRis([full]);
    expect(out).toContain("TY  - JOUR");
    expect(out).toContain("TI  - Estudo sobre X");
    expect(out).toContain("AU  - Silva, Ana");
    expect(out).toContain("AU  - Souza, João");
    expect(out).toContain("PY  - 2021");
    expect(out).toContain("DO  - 10.1000/xyz");
    expect(out).toContain("JO  - Revista Brasileira");
    expect(out).toContain("SP  - 45");
    expect(out).toContain("EP  - 60");
    expect(out.trimEnd().endsWith("ER  - ")).toBe(true);
  });

  it("OMITE tags de campos ausentes (não inventa — §II)", () => {
    const bare: RecordDetailData = {
      id: "22222222-2222-2222-2222-222222222222",
      title: "Sem metadados",
      authors: [],
      year: null,
      doi: null,
      language: null,
      abstract: null,
      journal: null,
      keywords: [],
      volume: null,
      issue: null,
      pages: null,
    };
    const out = serializeRis([bare]);
    expect(out).toContain("TI  - Sem metadados");
    expect(out).not.toContain("AU  -");
    expect(out).not.toContain("PY  -");
  });

  it("cobre todos os registros (FR-021)", () => {
    const out = serializeRis([full, { ...full, id: "33333333-3333-3333-3333-333333333333" }]);
    expect((out.match(/TY {2}- JOUR/g) ?? []).length).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar)**

Run: `npm run test -- tests/unit/export/serialize-ris.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/lib/export/serialize-ris.ts`**

```ts
import type { RecordDetailData } from "@/lib/record/queries";

/** Divide "45-60" em start/end de página para SP/EP (sem inventar quando ausente). */
function splitPages(pages: string | null): { sp: string | null; ep: string | null } {
  if (!pages) return { sp: null, ep: null };
  const m = pages.split(/[-–]/).map((p) => p.trim());
  return { sp: m[0] || null, ep: m[1] ?? null };
}

/** Serializa registros como RIS (TY JOUR ... ER). Tags ausentes são OMITIDAS (§II). */
export function serializeRis(records: RecordDetailData[]): string {
  return records
    .map((r) => {
      const lines: string[] = ["TY  - JOUR", `TI  - ${r.title}`];
      for (const a of r.authors) lines.push(`AU  - ${a}`);
      if (r.year !== null) lines.push(`PY  - ${r.year}`);
      if (r.journal) lines.push(`JO  - ${r.journal}`);
      if (r.volume) lines.push(`VL  - ${r.volume}`);
      if (r.issue) lines.push(`IS  - ${r.issue}`);
      const { sp, ep } = splitPages(r.pages);
      if (sp) lines.push(`SP  - ${sp}`);
      if (ep) lines.push(`EP  - ${ep}`);
      if (r.doi) lines.push(`DO  - ${r.doi}`);
      if (r.abstract) lines.push(`AB  - ${r.abstract}`);
      lines.push("ER  - ");
      return lines.join("\n");
    })
    .join("\n\n");
}
```

- [ ] **Step 4: Rodar o teste (deve passar)**

Run: `npm run test -- tests/unit/export/serialize-ris.test.ts`
Expected: 3 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/serialize-ris.ts tests/unit/export/serialize-ris.test.ts
git commit -m "feat(export): serializeRis (US5, FR-021)"
```

---

## Task 4: `serializeMarkdown` (montagem direta — seções + características + checklist)

**Files:**
- Modify: `src/lib/export/queries.ts` (adicionar `MarkdownInput` + `loadExportInputs`)
- Create: `src/lib/export/serialize-markdown.ts`
- Test: `tests/unit/export/serialize-markdown.test.ts`

> FR-020 (parte MD): o Markdown embute a **tabela de características** e o **checklist PRISMA** além das seções do relatório. Reusa `buildCharacteristicsTable` (F4), `loadPrismaChecklist` (F4) e `loadReport` (F3). A função pura recebe dados já carregados (testável sem DB).

- [ ] **Step 1: Adicionar tipos + `loadExportInputs` em `src/lib/export/queries.ts`**

Acrescente ao fim de `src/lib/export/queries.ts`:

```ts
import { loadReport, type ReportSectionRow } from "@/lib/report/queries";
import {
  buildCharacteristicsTable,
  type CharacteristicsTable,
} from "@/lib/prisma/characteristics";
import {
  loadPrismaChecklist,
  type ChecklistItem,
} from "@/lib/prisma/checklist";

export interface MarkdownInput {
  reviewTitle: string;
  sections: Array<{ kind: string; content: string }>;
  characteristics: CharacteristicsTable;
  checklist: ChecklistItem[];
}

/** Carrega tudo o que o Markdown precisa (seções + características + checklist). */
export async function loadExportInputs(
  deps: Deps,
  reviewId: string,
): Promise<MarkdownInput> {
  const [reportData, characteristics, checklist, reviewRow] = await Promise.all([
    loadReport(deps, reviewId),
    buildCharacteristicsTable(deps, reviewId),
    loadPrismaChecklist(deps, reviewId),
    deps.supabase.from("review").select("title").eq("id", reviewId).maybeSingle(),
  ]);
  const sections = (reportData?.sections ?? ([] as ReportSectionRow[])).map(
    (s) => ({ kind: s.kind as string, content: s.content }),
  );
  return {
    reviewTitle:
      (reviewRow.data as { title?: string } | null)?.title ?? "Revisão",
    sections,
    characteristics,
    checklist,
  };
}
```

- [ ] **Step 2: Escrever o teste unit (falhando)**

```ts
import { describe, it, expect } from "vitest";
import { serializeMarkdown } from "@/lib/export/serialize-markdown";
import type { MarkdownInput } from "@/lib/export/queries";

const input: MarkdownInput = {
  reviewTitle: "Minha Revisão",
  sections: [
    { kind: "methods", content: "Texto dos métodos." },
    { kind: "results", content: "Texto dos resultados." },
  ],
  characteristics: {
    columns: ["Estudo", "País"],
    rows: [{ recordId: "r1", cells: { Estudo: "Silva 2021", País: "Brasil" } }],
  },
  checklist: [
    { itemCode: "1", label: "Título", sectionRef: "methods", status: "met" },
    { itemCode: "13", label: "Viés", sectionRef: null, status: "not_applicable" },
  ],
};

describe("serializeMarkdown", () => {
  it("começa com o título da revisão como H1", () => {
    expect(serializeMarkdown(input).startsWith("# Minha Revisão")).toBe(true);
  });

  it("inclui as seções com cabeçalhos em pt-BR e na ordem recebida", () => {
    const out = serializeMarkdown(input);
    expect(out).toContain("## Métodos");
    expect(out).toContain("Texto dos métodos.");
    expect(out.indexOf("## Métodos")).toBeLessThan(out.indexOf("## Resultados"));
  });

  it("embute a tabela de características (FR-020)", () => {
    const out = serializeMarkdown(input);
    expect(out).toContain("## Tabela de características dos estudos");
    expect(out).toContain("| Estudo | País |");
    expect(out).toContain("| Silva 2021 | Brasil |");
  });

  it("embute o checklist PRISMA com status traduzido", () => {
    const out = serializeMarkdown(input);
    expect(out).toContain("## Checklist PRISMA 2020");
    expect(out).toContain("Título");
    expect(out).toContain("Atendido");
    expect(out).toContain("Não aplicável");
  });
});
```

- [ ] **Step 3: Rodar o teste (deve falhar)**

Run: `npm run test -- tests/unit/export/serialize-markdown.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 4: Implementar `src/lib/export/serialize-markdown.ts`**

```ts
import type { MarkdownInput } from "./queries";
import type { ChecklistStatus } from "@/lib/prisma/checklist";

const SECTION_TITLES: Record<string, string> = {
  methods: "Métodos",
  results: "Resultados",
  discussion: "Discussão",
  conclusion: "Conclusão",
  ai_declaration: "Declaração de uso de IA",
  deviations: "Desvios do protocolo",
};

const STATUS_LABEL: Record<ChecklistStatus, string> = {
  met: "Atendido",
  pending: "Pendente",
  not_applicable: "Não aplicável",
};

/** Escapa pipes/quebras para não quebrar células de tabela markdown. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Monta o relatório completo em Markdown (seções + características + checklist). */
export function serializeMarkdown(input: MarkdownInput): string {
  const parts: string[] = [`# ${input.reviewTitle}`];

  for (const s of input.sections) {
    parts.push(`## ${SECTION_TITLES[s.kind] ?? s.kind}\n\n${s.content}`);
  }

  // Tabela de características (FR-020)
  const { columns, rows } = input.characteristics;
  if (columns.length > 0) {
    const header = `| ${columns.map(cell).join(" | ")} |`;
    const sep = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows
      .map((r) => `| ${columns.map((c) => cell(r.cells[c])).join(" | ")} |`)
      .join("\n");
    parts.push(
      `## Tabela de características dos estudos\n\n${header}\n${sep}\n${body}`,
    );
  }

  // Checklist PRISMA 2020
  if (input.checklist.length > 0) {
    const header = `| Item | Descrição | Seção | Status |`;
    const sep = `| --- | --- | --- | --- |`;
    const body = input.checklist
      .map(
        (i) =>
          `| ${i.itemCode} | ${cell(i.label)} | ${cell(i.sectionRef ?? "")} | ${STATUS_LABEL[i.status]} |`,
      )
      .join("\n");
    parts.push(`## Checklist PRISMA 2020\n\n${header}\n${sep}\n${body}`);
  }

  return parts.join("\n\n") + "\n";
}
```

- [ ] **Step 5: Rodar o teste (deve passar)**

Run: `npm run test -- tests/unit/export/serialize-markdown.test.ts`
Expected: 4 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/queries.ts src/lib/export/serialize-markdown.ts tests/unit/export/serialize-markdown.test.ts
git commit -m "feat(export): serializeMarkdown + loadExportInputs (US5, FR-020 parte MD)"
```

---

## Task 5: Worker — `enqueueReportExportJob`, `processReportExportJob`, `runReportExportWorkerWith`

**Files:**
- Create: `src/lib/export/enqueue.ts`
- Create: `src/lib/export/batch-worker.ts`
- Create: `src/lib/export/batch-run.ts`
- Test: `tests/integration/export.test.ts` (acrescentar bloco do worker)

> Espelha `src/lib/report/{enqueue,batch-run,batch-worker}.ts`. **Item = um formato**: falha de um não derruba os demais (FR-023). Nesta fatia o worker serializa **md/bibtex/ris**; formatos da Fatia 6 (docx/pdf/prisma_*) caem no `default` → item falha isolado (resiliência), sem quebrar o job.

- [ ] **Step 1: Implementar `src/lib/export/enqueue.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExportEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/** Cria o job report_export (RPC create_report_export_job). Só enfileira (§VIII). */
export async function enqueueReportExportJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  formats: string[],
): Promise<ExportEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc(
    "create_report_export_job",
    { p_review_id: reviewId, p_formats: formats },
  );
  if (error) throw new Error(error.message);
  const jobId = (job as { id: string }).id;
  const { count, error: cErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);
  return { job_id: jobId, status: "queued", item_count: count ?? 0 };
}
```

- [ ] **Step 2: Implementar `src/lib/export/batch-worker.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeMarkdown } from "./serialize-markdown";
import { serializeBibtex } from "./serialize-bibtex";
import { serializeRis } from "./serialize-ris";
import { loadExportInputs, listIncludedFtRecordsDetail } from "./queries";

interface JobItemRow {
  id: string;
  payload: { format: string };
  attempts: number;
}

export interface ExportBatchDeps {
  supabase: SupabaseClient; // admin/service: upload no Storage + insert export_artifact
}

export interface ExportBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

const EXT: Record<string, string> = { md: "md", bibtex: "bib", ris: "ris" };
const MIME: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  bibtex: "application/x-bibtex; charset=utf-8",
  ris: "application/x-research-info-systems; charset=utf-8",
};

/**
 * Processa um job report_export. Item = um formato (resiliente, FR-023):
 *   serializa → upload no bucket exports → insere export_artifact → marca done.
 * Formato não suportado nesta fatia (docx/pdf/prisma_*) → item falha isolado.
 */
export async function processReportExportJob(
  deps: ExportBatchDeps,
  jobId: string,
): Promise<ExportBatchResult> {
  const { supabase } = deps;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    const { data: jobData, error: jobErr } = await supabase
      .from("job")
      .select("id, review_id")
      .eq("id", jobId)
      .single();
    if (jobErr) throw new Error(jobErr.message);
    const reviewId = (jobData as { review_id: string }).review_id;

    const { data: reportRow } = await supabase
      .from("report")
      .select("id")
      .eq("review_id", reviewId)
      .maybeSingle();
    const reportId = (reportRow as { id: string } | null)?.id ?? null;

    const { data: items, error: itemsErr } = await supabase
      .from("job_item")
      .select("id, payload, attempts")
      .eq("job_id", jobId)
      .eq("status", "pending");
    if (itemsErr) throw new Error(itemsErr.message);

    let done = 0;
    let failed = 0;

    for (const it of (items ?? []) as JobItemRow[]) {
      const format = it.payload.format;
      try {
        const bytes = await serializeFormat(supabase, reviewId, format);
        const ext = EXT[format];
        const path = `review/${reviewId}/report/${reportId ?? "_"}/${format}/${it.id}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("exports")
          .upload(path, bytes, { contentType: MIME[format], upsert: true });
        if (upErr) throw new Error(upErr.message);

        const { error: artErr } = await supabase.from("export_artifact").insert({
          review_id: reviewId,
          report_id: reportId,
          format,
          storage_path: path,
          job_id: jobId,
        });
        if (artErr) throw new Error(artErr.message);

        await supabase.from("job_item").update({ status: "done" }).eq("id", it.id);
        done++;
      } catch (e) {
        await supabase
          .from("job_item")
          .update({
            status: "failed",
            error: (e as Error).message,
            attempts: (it.attempts ?? 0) + 1,
          })
          .eq("id", it.id);
        failed++;
      }
    }

    return await _finalizeJob(supabase, jobId, done, failed);
  } catch (e) {
    await supabase.from("job").update({ status: "failed" }).eq("id", jobId);
    throw e;
  }
}

/** Serializa um formato suportado nesta fatia. Outros → erro isolado (Fatia 6). */
async function serializeFormat(
  supabase: SupabaseClient,
  reviewId: string,
  format: string,
): Promise<Buffer> {
  switch (format) {
    case "md": {
      const input = await loadExportInputs({ supabase }, reviewId);
      return Buffer.from(serializeMarkdown(input), "utf-8");
    }
    case "bibtex": {
      const records = await listIncludedFtRecordsDetail({ supabase }, reviewId);
      return Buffer.from(serializeBibtex(records), "utf-8");
    }
    case "ris": {
      const records = await listIncludedFtRecordsDetail({ supabase }, reviewId);
      return Buffer.from(serializeRis(records), "utf-8");
    }
    default:
      throw new Error(`formato '${format}' não suportado nesta versão`);
  }
}

/** Espelha _finalizeJob do report batch-worker (recomputa de TODOS os itens → retomável). */
async function _finalizeJob(
  supabase: SupabaseClient,
  jobId: string,
  done: number,
  failed: number,
): Promise<ExportBatchResult> {
  const { data: counts, error } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const totalDone = all.filter((i) => i.status === "done").length;
  const totalFailed = all.filter((i) => i.status === "failed").length;

  const status: ExportBatchResult["status"] =
    totalFailed > 0 ? (totalDone > 0 ? "completed_with_errors" : "failed") : "completed";

  await supabase
    .from("job")
    .update({
      status,
      progress: total ? Math.round((totalDone / total) * 100) : 100,
    })
    .eq("id", jobId);

  return { job_id: jobId, status, done, failed };
}
```

- [ ] **Step 3: Implementar `src/lib/export/batch-run.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { processReportExportJob } from "./batch-worker";

/** Processa todos os jobs report_export ativos da Revisão (client admin/service). */
export async function runReportExportWorkerWith(
  supabase: SupabaseClient,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "report_export")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processReportExportJob({ supabase }, j.id);
  }
}
```

- [ ] **Step 4: Acrescentar o teste de integração do worker em `tests/integration/export.test.ts`**

Adicione os imports no topo do arquivo e um novo `describe` (o worker usa `svc` = service client, como nos testes do report):

```ts
import { enqueueReportExportJob } from "@/lib/export/enqueue";
import { runReportExportWorkerWith } from "@/lib/export/batch-run";

describe("Fatia 5 — worker report_export", () => {
  it("gera md/bibtex/ris: 3 artefatos + objetos no bucket; job completed", async () => {
    const { svc, member, reviewId } = await seedReview("worker");
    // mínimos para conteúdo: 1 estudo included_ft + 1 report com 1 seção.
    await svc.from("record").insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo A", authors: ["Silva, A"], year: 2020 },
      corpus_state: "included_ft",
    });
    const { data: rep } = await svc
      .from("report")
      .insert({ review_id: reviewId, status: "ready" })
      .select("id")
      .single();
    await svc.from("report_section").insert({
      review_id: reviewId,
      report_id: (rep as { id: string }).id,
      kind: "methods",
      content: "Métodos.",
      edit_state: "deterministic",
    });

    await enqueueReportExportJob({ supabase: member }, reviewId, [
      "md",
      "bibtex",
      "ris",
    ]);
    await runReportExportWorkerWith(svc, reviewId);

    const { data: arts } = await svc
      .from("export_artifact")
      .select("format, storage_path")
      .eq("review_id", reviewId);
    expect(
      (arts ?? []).map((a) => (a as { format: string }).format).sort(),
    ).toEqual(["bibtex", "md", "ris"]);

    // objetos realmente no bucket
    for (const a of (arts ?? []) as { storage_path: string }[]) {
      const slash = a.storage_path.lastIndexOf("/");
      const { data: listed } = await svc.storage
        .from("exports")
        .list(a.storage_path.slice(0, slash));
      expect((listed ?? []).length).toBeGreaterThan(0);
    }

    const { data: job } = await svc
      .from("job")
      .select("status, progress")
      .eq("review_id", reviewId)
      .eq("type", "report_export")
      .single();
    expect((job as { status: string }).status).toBe("completed");
    expect((job as { progress: number }).progress).toBe(100);
  });

  it("resiliência por-formato: formato não suportado falha isolado (FR-023)", async () => {
    const { svc, member, reviewId } = await seedReview("resil");
    await enqueueReportExportJob({ supabase: member }, reviewId, ["md", "docx"]);
    await runReportExportWorkerWith(svc, reviewId);

    const { data: job } = await svc
      .from("job")
      .select("id, status")
      .eq("review_id", reviewId)
      .eq("type", "report_export")
      .single();
    expect((job as { status: string }).status).toBe("completed_with_errors");

    const { data: items } = await svc
      .from("job_item")
      .select("payload, status")
      .eq("job_id", (job as { id: string }).id);
    const byFmt = Object.fromEntries(
      (items ?? []).map((i) => [
        (i as { payload: { format: string } }).payload.format,
        (i as { status: string }).status,
      ]),
    );
    expect(byFmt.md).toBe("done");
    expect(byFmt.docx).toBe("failed");

    // o formato bom gerou artefato; o ruim não.
    const { data: arts } = await svc
      .from("export_artifact")
      .select("format")
      .eq("review_id", reviewId);
    expect((arts ?? []).map((a) => (a as { format: string }).format)).toEqual([
      "md",
    ]);
  });
});
```

- [ ] **Step 5: Rodar os testes de integração**

Run: `npm run test -- tests/integration/export.test.ts`
Expected: todos os testes (migration + worker) PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/enqueue.ts src/lib/export/batch-worker.ts src/lib/export/batch-run.ts tests/integration/export.test.ts
git commit -m "feat(export): worker report_export resiliente por-formato + persistência (US5, FR-023)"
```

---

## Task 6: Server action `enqueueExport` + query `loadExportArtifacts`

**Files:**
- Modify: `src/lib/export/queries.ts` (adicionar `loadExportArtifacts`)
- Modify: `app/reviews/[reviewId]/report/actions.ts`

- [ ] **Step 1: Adicionar `loadExportArtifacts` em `src/lib/export/queries.ts`**

```ts
export interface ExportArtifactRow {
  id: string;
  format: ExportFormat;
  storage_path: string;
  created_at: string;
}

/** Artefatos exportados da Revisão (mais recentes primeiro) — para a UI. */
export async function loadExportArtifacts(
  deps: Deps,
  reviewId: string,
): Promise<ExportArtifactRow[]> {
  const { data, error } = await deps.supabase
    .from("export_artifact")
    .select("id, format, storage_path, created_at")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExportArtifactRow[];
}
```

- [ ] **Step 2: Acrescentar a server action `enqueueExport` em `app/reviews/[reviewId]/report/actions.ts`**

Adicione os imports no topo (junto aos existentes) e a função ao fim do arquivo:

```ts
import { enqueueReportExportJob } from "@/lib/export/enqueue";
import { runReportExportWorkerWith } from "@/lib/export/batch-run";

/** Enfileira a exportação (client membro) e roda o worker (admin). Sem IA, sem custo. */
export async function enqueueExport(reviewId: string, formats: string[]) {
  const { supabase } = await requireMember(reviewId);
  const admin = createAdminClient();
  await enqueueReportExportJob({ supabase }, reviewId, formats);
  await runReportExportWorkerWith(admin, reviewId);
  revalidate(reviewId);
  return { ok: true as const };
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/export/queries.ts "app/reviews/[reviewId]/report/actions.ts"
git commit -m "feat(export): server action enqueueExport + loadExportArtifacts (US5)"
```

---

## Task 7: Route handler de download

**Files:**
- Create: `app/reviews/[reviewId]/report/export/[artifactId]/route.ts`

> Espelha `app/reviews/[reviewId]/prisma/export/route.ts` (auth + `is_review_member` + `Content-Disposition`). Baixa do bucket via **client do usuário** (RLS do bucket `exports` valida membership pelo path).

- [ ] **Step 1: Implementar o route handler**

```ts
// app/reviews/[reviewId]/report/export/[artifactId]/route.ts
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXT: Record<string, string> = {
  md: "md",
  bibtex: "bib",
  ris: "ris",
  docx: "docx",
  pdf: "pdf",
  prisma_svg: "svg",
  prisma_png: "png",
};
const MIME: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  bibtex: "application/x-bibtex; charset=utf-8",
  ris: "application/x-research-info-systems; charset=utf-8",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reviewId: string; artifactId: string }> },
) {
  const { reviewId, artifactId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Não autenticado", { status: 401 });
  const { data: member, error } = await supabase.rpc("is_review_member", {
    p_review_id: reviewId,
  });
  if (error || !member) return new Response("Acesso negado", { status: 403 });

  const { data: art } = await supabase
    .from("export_artifact")
    .select("format, storage_path")
    .eq("id", artifactId)
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!art) return new Response("Artefato não encontrado", { status: 404 });

  const { format, storage_path } = art as {
    format: string;
    storage_path: string;
  };
  const { data: blob, error: dlErr } = await supabase.storage
    .from("exports")
    .download(storage_path);
  if (dlErr || !blob) return new Response("Falha no download", { status: 500 });

  const buf = Buffer.from(await blob.arrayBuffer());
  return new Response(buf, {
    headers: {
      "Content-Type": MIME[format] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="relatorio-${reviewId}.${EXT[format] ?? "bin"}"`,
    },
  });
}
```

- [ ] **Step 2: Verificar tipos + lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/report/export/[artifactId]/route.ts"
git commit -m "feat(export): route handler de download de artefato (US5)"
```

---

## Task 8: UI — `ExportPanel` + montagem em `report/page.tsx`

**Files:**
- Create: `src/components/report/ExportPanel.tsx`
- Modify: `app/reviews/[reviewId]/report/page.tsx`

- [ ] **Step 1: Implementar `src/components/report/ExportPanel.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";

const FORMAT_OPTIONS = [
  { value: "md", label: "Markdown (.md)" },
  { value: "bibtex", label: "BibTeX (.bib)" },
  { value: "ris", label: "RIS (.ris)" },
] as const;

const FORMAT_LABEL: Record<string, string> = {
  md: "Markdown",
  bibtex: "BibTeX",
  ris: "RIS",
};

interface Artifact {
  id: string;
  format: string;
  created_at: string;
}

export function ExportPanel({
  reviewId,
  artifacts,
  onExport,
}: {
  reviewId: string;
  artifacts: Artifact[];
  onExport: (reviewId: string, formats: string[]) => Promise<{ ok: true }>;
}) {
  const [selected, setSelected] = useState<string[]>(["md"]);
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<string | null>(null);

  function toggle(value: string) {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  return (
    <section className="space-y-3 rounded border border-line p-3">
      <h2 className="text-sm font-medium text-ink">Exportação</h2>

      <div className="flex flex-wrap gap-3">
        {FORMAT_OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex items-center gap-1 text-sm text-ink"
          >
            <input
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>

      <button
        type="button"
        className="rounded bg-ink px-3 py-1 text-sm text-paper disabled:opacity-50"
        disabled={pending || selected.length === 0}
        onClick={() =>
          start(async () => {
            await onExport(reviewId, selected);
            setInfo("Exportação concluída.");
          })
        }
      >
        Exportar
      </button>
      {info && <p className="text-xs text-ink-soft">{info}</p>}

      {artifacts.length > 0 && (
        <ul className="space-y-1 text-sm">
          {artifacts.map((a) => (
            <li key={a.id}>
              <a
                className="text-accent underline"
                href={`/reviews/${reviewId}/report/export/${a.id}`}
              >
                Baixar {FORMAT_LABEL[a.format] ?? a.format}
              </a>
              <span className="ml-2 text-xs text-ink-soft">
                {new Date(a.created_at).toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Montar o painel em `app/reviews/[reviewId]/report/page.tsx`**

No Server Component, carregue os artefatos e renderize o painel passando a action. Acrescente os imports e, dentro do corpo (após resolver `reviewId`/client), o carregamento + render:

```tsx
import { loadExportArtifacts } from "@/lib/export/queries";
import { ExportPanel } from "@/components/report/ExportPanel";
import { enqueueExport } from "./actions";

// ... dentro do componente, junto aos demais loads (usando o MESMO client da página):
const artifacts = await loadExportArtifacts({ supabase }, reviewId);

// ... no JSX, junto aos outros painéis do relatório (checklist/características):
<ExportPanel reviewId={reviewId} artifacts={artifacts} onExport={enqueueExport} />
```

> **Alinhar na execução:** abra `app/reviews/[reviewId]/report/page.tsx` e use o nome de variável do Supabase client já existente (veja as chamadas a `loadReport`/`loadPrismaChecklist`/`buildCharacteristicsTable` no arquivo); posicione `<ExportPanel/>` junto aos painéis `PrismaChecklistPanel`/`CharacteristicsTablePanel`.

- [ ] **Step 3: Verificar tipos + lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/report/ExportPanel.tsx "app/reviews/[reviewId]/report/page.tsx"
git commit -m "feat(export): painel de exportação na página do relatório (US5)"
```

---

## Task 9: Verificação final da fatia (gate "Pronto quando")

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte unit + integration da fatia**

Run: `npm run test -- tests/unit/export tests/integration/export.test.ts`
Expected: todos PASS (serializadores BibTeX/RIS/MD; RLS bucket + `export_artifact`; resiliência por-formato).

- [ ] **Step 2: Suíte completa (não-regressão Marcos 1–3)**

Run: `npm run test`
Expected: toda a suíte verde.

- [ ] **Step 3: Type-check + lint do projeto**

Run: `npm run typecheck && npm run lint`
Expected: ambos sem erros.

- [ ] **Step 4: Escrever `COMPLETION-fatia-5.md`**

Crie `specs/003-marco3-saida-sintese-relatorio/.superpowers/COMPLETION-fatia-5.md` resumindo: migration `0021`, bucket `exports`, serializadores próprios, worker resiliente, action+route de download, UI; resultados de test/lint/typecheck; status "build completo, aguardando merge (CHECKPOINT 3)".

- [ ] **Step 5: Commit final + PARAR (CHECKPOINT 3)**

```bash
git add specs/003-marco3-saida-sintese-relatorio/.superpowers/COMPLETION-fatia-5.md
git commit -m "docs(export): COMPLETION-fatia-5 (build complete, awaiting merge)"
```

Em seguida **PARAR**: apresentar ao desenvolvedor o branch da fatia, o diff e os resultados de testes + `npm run lint` + `npm run typecheck`. **Não** fazer merge/push. Aguardar o merge manual antes da Fatia 6.

---

## Self-Review (cobertura do escopo da Fatia 5)

- **Migration lidera (export_artifact + RLS + bucket + policies + `ALTER job_type` + RPC):** Task 1. ✓
- **Worker Node resiliente por-formato (item = formato, FR-023, retomável):** Task 5 (`processReportExportJob` + `_finalizeJob` recomputa de todos os itens → retomável). ✓
- **Serializadores próprios MD/BibTeX/RIS cobrindo `included_ft` (FR-021), sem inventar metadados (§II):** Tasks 2–4. ✓
- **FR-020 (parte MD): MD embute características + checklist:** Task 4. ✓
- **Persistência no bucket + `export_artifact` + download:** Tasks 5 e 7. ✓
- **`enqueueExport` server action (enqueue client-membro, worker admin):** Task 6. ✓
- **Out-of-scope respeitado:** DOCX/PDF/APA7 não implementados (apenas `default`→falha isolada no worker; UI só oferece md/bibtex/ris). ✓
- **Sem libs novas:** serializadores próprios; nenhuma dependência adicionada. ✓
- **Não-regressão:** nada nos Marcos 1–3 é refatorado; só novos arquivos + 2 acréscimos pontuais (`report/actions.ts`, `report/page.tsx`). ✓
- **Gate "Pronto quando" (unit serializers + integration RLS/artifact/resiliência + lint+tsc):** Task 9. ✓
- **Consistência de tipos:** `ExportFormat`/`MarkdownInput`/`RecordDetailData`/`ChecklistItem`/`CharacteristicsTable` usados de forma idêntica entre queries, serializadores e worker. ✓

**Pendente confirmar na execução** (não bloqueia o plano): nome exato da variável do Supabase client em `report/page.tsx` e o ponto de montagem do `<ExportPanel/>` — Task 8, Step 2 instrui a alinhar com os loads já existentes no arquivo.
