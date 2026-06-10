# Fatia 2 — Pipeline de texto assíncrono híbrido (US1-B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Escopo:** apenas a **Fatia 2** do `slicing.md` (US1-B). Processa os PDFs anexados na
> Fatia 1 (job `pdf_text_pipeline` em `queued`): worker **server-side Node** que extrai
> texto **nativo determinístico** por página, detecta páginas escaneadas por **limiar de
> densidade** e faz **OCR multimodal** via novo `LLMProvider.ocrPage`, gravando `text_layer`
> com `origin ∈ {nativo, ocr_ia}` e movendo `document.processing_status`
> `queued → processing → text_ready | partial | failed`. **Não** mexe em extração por IA
> (Fatia 4), formulário (Fatia 3) nem embeddings (Fatia 6).

**Goal:** Cada PDF anexado vira texto pronto para IA: o worker baixa o binário do Storage,
extrai texto nativo por página, faz OCR multimodal nas páginas escaneadas, e persiste a
camada de texto com proveniência (`origin`) por página — retomável e resiliente por-item/página.

**Architecture:** Espelha o worker de screening do Marco 1 (`src/lib/screening/worker.ts` +
`run.ts`): `runPdfPipelineWorkerWith(admin, provider, reviewId, deps?)` varre os jobs
`pdf_text_pipeline` ativos; `processPdfPipelineJob` processa **1 job_item = 1 PDF** com
commit por item (retomável) e páginas como sub-passos (resiliente por-página → `partial`).
A extração nativa (`unpdf`) e a rasterização para OCR ficam atrás de **funções injetáveis**,
para que a lógica do worker seja testável com o `MockLLMProvider` e um rasterizador falso;
a lib real e o limiar de densidade são calibrados contra PDFs reais (A1/D31). Server Action
`runPdfPipelineWorker` espelha `runScreeningWorker` (resolve provider BYOK, fallback Mock).

**Tech Stack:** Next.js 14 App Router (Server Actions), Supabase (Postgres + RLS + Storage,
service-role no worker), **`unpdf`** (extração nativa + rasterização de página — nova dep por
tarefa explícita, constitution §Portões), `LLMProvider` multimodal (Claude) para OCR, Vitest
(unit/integração). Sem novas dependências além de `unpdf`.

**Pré-requisitos do executor:**
- Worktree isolado já criado (skill `using-git-worktrees`); baseline aplicado (`.env.local`
  copiado, `npm install`, `supabase start && supabase db reset`, shebang do husky) —
  ver memória "Worktree baseline setup".
- Supabase local rodando; `npm run gen:types` requer o DB local.
- Base: feature `002-marco2-coracao-ai-first` com a Fatia 1 já mergeada (migration `0012`,
  tabela `document`, bucket `pdfs`, job type `pdf_text_pipeline`, RPC `create_pdf_pipeline_job`).
- Testes de integração batem na camada de dados direto (`serviceClient()` / client de membro),
  nunca no `createClient()` server (memória "Integration tests can't call server client wrappers").

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0013_text_layer.sql` | **Criar:** enum `text_origin` + tabela `text_layer` + RLS (select/insert membro). |
| `src/types/database.ts` | **Modificar (regen):** tipos de `text_layer`. |
| `src/lib/documents/extract.ts` | **Criar:** `extractNativeText(bytes)` (unpdf, por página) + `isScannedPage(content, threshold)` (densidade). |
| `src/lib/documents/rasterize.ts` | **Criar:** `rasterizePage(bytes, page)` (unpdf `renderPageAsImage` → base64 PNG) — isolado/injetável (calibração D31). |
| `src/lib/ai/llm/types.ts` | **Modificar:** adicionar `ocrPage(...)` ao contrato `LLMProvider` + tipo `OcrResult`. |
| `src/lib/ai/llm/mock.ts` | **Modificar:** `ocrPage` determinístico no `MockLLMProvider`. |
| `src/lib/ai/llm/anthropic.ts` | **Modificar:** `ocrPage` multimodal (bloco de imagem). |
| `src/lib/documents/pipeline-worker.ts` | **Criar:** `processPdfPipelineJob(deps, jobId)` — 1 PDF/item, páginas como sub-passos, state machine, resiliência. |
| `src/lib/documents/run.ts` | **Criar:** `runPdfPipelineWorkerWith(supabase, provider, reviewId, deps?)`. |
| `app/reviews/[reviewId]/workbench/actions.ts` | **Modificar:** Server Action `runPdfPipelineWorker(reviewId)`. |
| `src/components/documents/DocumentsPanel.tsx` | **Modificar:** disparar `runPdfPipelineWorker` após upload bem-sucedido (aditivo). |
| `tests/unit/documents/extract.test.ts` | **Criar:** densidade + extração nativa (fixture). |
| `tests/unit/ai/ocr-page.test.ts` | **Criar:** `MockLLMProvider.ocrPage` determinístico. |
| `tests/integration/pdf-pipeline.test.ts` | **Criar:** pipeline ponta-a-ponta (nativo/ocr/partial/retomável/RLS). |

---

## Task 1: Migração 0013 — `text_layer` + RLS

**Files:**
- Create: `supabase/migrations/0013_text_layer.sql`
- Modify: `src/types/database.ts` (via `npm run gen:types`)
- Test: `tests/integration/pdf-pipeline.test.ts` (RLS coberto na Task 6)

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/0013_text_layer.sql`:

```sql
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
```

- [ ] **Step 2: Aplicar e regenerar tipos**

Run:
```bash
supabase db reset
npm run gen:types
```
Expected: reset sem erro; `src/types/database.ts` passa a conter `text_layer` e o enum `text_origin`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_text_layer.sql src/types/database.ts
git commit -m "feat(002-f2): migration 0013 text_layer + RLS (US1-B)"
```

---

## Task 2: Extração nativa por página + classificador de densidade

> Nova dependência **por tarefa explícita** (constitution §Portões): `unpdf` (wrapper de
> pdf.js compatível com Node/serverless, R1). O limiar de densidade tem um **default**
> calibrável contra PDFs reais (A1/D31).

**Files:**
- Create: `src/lib/documents/extract.ts`
- Test: `tests/unit/documents/extract.test.ts`

- [ ] **Step 1: Adicionar a dependência**

Run:
```bash
npm install unpdf
```
Expected: `unpdf` em `dependencies` do `package.json`.

- [ ] **Step 2: Escrever o teste de falha (densidade + extração)**

Create `tests/unit/documents/extract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractNativeText, isScannedPage } from "@/lib/documents/extract";

describe("isScannedPage — limiar de densidade (A1/D31)", () => {
  it("página vazia/curta é tratada como escaneada", () => {
    expect(isScannedPage("", 30)).toBe(true);
    expect(isScannedPage("   \n  ", 30)).toBe(true);
    expect(isScannedPage("ab cd", 30)).toBe(true);
  });
  it("página com texto denso é nativa", () => {
    const dense = "palavra ".repeat(50);
    expect(isScannedPage(dense, 30)).toBe(false);
  });
});

describe("extractNativeText — por página (R1)", () => {
  it("extrai páginas do PDF nativo de fixture com conteúdo 1-based", async () => {
    const bytes = new Uint8Array(
      readFileSync(join(process.cwd(), "tests/fixtures/sample.pdf")),
    );
    const { totalPages, pages } = await extractNativeText(bytes);
    expect(totalPages).toBeGreaterThanOrEqual(1);
    expect(pages.length).toBe(totalPages);
    expect(pages[0]!.page).toBe(1);
    expect(typeof pages[0]!.content).toBe("string");
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run tests/unit/documents/extract.test.ts`
Expected: FAIL — `Cannot find module '@/lib/documents/extract'`.

- [ ] **Step 4: Implementar a extração**

Create `src/lib/documents/extract.ts`:

```ts
import { extractText, getDocumentProxy } from "unpdf";

export interface PageText {
  page: number; // 1-based
  content: string;
}

export interface NativeExtraction {
  totalPages: number;
  pages: PageText[];
}

/**
 * Limiar default de caracteres não-brancos por página abaixo do qual a página é
 * considerada "escaneada" (sem camada de texto útil) e vai para OCR (R2/A1).
 * CALIBRAR contra PDFs reais do corpus-alvo (D31) — ajustável sem mudar schema.
 */
export const DEFAULT_SCAN_THRESHOLD = 30;

export function isScannedPage(content: string, threshold = DEFAULT_SCAN_THRESHOLD): boolean {
  const meaningful = content.replace(/\s+/g, "").length;
  return meaningful < threshold;
}

/** Extração nativa determinística por página (R1, FR-007). Roda no worker (§VIII). */
export async function extractNativeText(bytes: Uint8Array): Promise<NativeExtraction> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const arr = Array.isArray(text) ? text : [text];
  const pages: PageText[] = arr.map((content, i) => ({
    page: i + 1,
    content: content ?? "",
  }));
  return { totalPages, pages };
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx vitest run tests/unit/documents/extract.test.ts`
Expected: PASS (3 testes de densidade + 1 de extração).

> Se `extractNativeText` falhar contra a fixture (API do `unpdf` divergente da versão
> instalada), inspecionar o retorno real de `extractText(..., { mergePages: false })` e
> ajustar o mapeamento. NÃO trocar de biblioteca sem registrar (R1, dep por tarefa explícita).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/documents/extract.ts tests/unit/documents/extract.test.ts
git commit -m "feat(002-f2): native PDF text extraction + scan density classifier (R1/A1)"
```

---

## Task 3: Estender `LLMProvider` com `ocrPage` (OCR multimodal)

**Files:**
- Modify: `src/lib/ai/llm/types.ts`
- Modify: `src/lib/ai/llm/mock.ts`
- Modify: `src/lib/ai/llm/anthropic.ts`
- Test: `tests/unit/ai/ocr-page.test.ts`

- [ ] **Step 1: Escrever o teste de falha (mock determinístico)**

Create `tests/unit/ai/ocr-page.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "@/lib/ai/llm/mock";

describe("MockLLMProvider.ocrPage (R2)", () => {
  it("retorna texto determinístico com proveniência e estado pending", async () => {
    const provider = new MockLLMProvider();
    const res = await provider.ocrPage({
      imageBase64: "ZmFrZQ==",
      mediaType: "image/png",
      page: 3,
    });
    expect(res.output.text).toContain("[OCR p.3]");
    expect(res.provenance).toHaveProperty("model");
    expect(res.state).toBe("pending");
    expect(res.not_found).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run tests/unit/ai/ocr-page.test.ts`
Expected: FAIL — `provider.ocrPage is not a function`.

- [ ] **Step 3: Estender o contrato `LLMProvider`**

In `src/lib/ai/llm/types.ts`, add the `OcrResult` interface after `ScreeningPreclassification` (around line 49):

```ts
export interface OcrResult {
  text: string; // texto OCR da página, no idioma original (FR-015)
}
```

And add the method to the `LLMProvider` interface (after `preclassifyScreening`, before `estimateCost`):

```ts
  /** OCR multimodal de uma página rasterizada (R2/FR-007/FR-008). Saída no idioma original. */
  ocrPage(input: {
    imageBase64: string;
    mediaType: "image/png" | "image/jpeg";
    page: number;
  }): Promise<LlmSuggestion<OcrResult>>;
```

- [ ] **Step 4: Implementar no `MockLLMProvider`**

In `src/lib/ai/llm/mock.ts`, add to the `OcrResult` import list and add the method inside the class (after `preclassifyScreening`):

```ts
  async ocrPage(input: {
    imageBase64: string;
    mediaType: "image/png" | "image/jpeg";
    page: number;
  }): Promise<LlmSuggestion<OcrResult>> {
    return suggestion<OcrResult>(
      { text: `[OCR p.${input.page}] texto simulado` },
      `ocr:p${input.page}`,
    );
  }
```

Update the type import at the top of `mock.ts` to include `OcrResult`:

```ts
import type {
  CostEstimate,
  EligibilityDerivation,
  LLMProvider,
  LlmSuggestion,
  OcrResult,
  ProtocolDraft,
  ProviderIdentity,
  ScreeningPreclassification,
} from "./types";
```

- [ ] **Step 5: Implementar no `AnthropicProvider`**

In `src/lib/ai/llm/anthropic.ts`, add `OcrResult` to the type import and add the method inside the class (after `preclassifyScreening`, before `estimateCost`):

```ts
  async ocrPage(input: {
    imageBase64: string;
    mediaType: "image/png" | "image/jpeg";
    page: number;
  }): Promise<LlmSuggestion<OcrResult>> {
    const prompt = `Transcreva fielmente TODO o texto desta página de PDF escaneada (página ${input.page}). Preserve o idioma original. Responda só com o texto, sem comentários.`;
    const msg = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: `${PT_BR}\nVocê faz OCR fiel; não traduz, não resume.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: input.mediaType, data: input.imageBase64 },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const text = textOf(msg);
    return {
      output: { text },
      provenance: { model: MODEL, version: MODEL, prompt_or_span: prompt, timestamp: nowIso() },
      state: "pending",
      not_found: text.trim() === "",
    };
  }
```

Update the type import block at the top of `anthropic.ts` to include `OcrResult`.

- [ ] **Step 6: Rodar testes + type-check**

Run: `npx vitest run tests/unit/ai/ocr-page.test.ts && npx tsc --noEmit`
Expected: PASS; 0 erros de tipo (todas as implementações de `LLMProvider` ganharam `ocrPage`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/llm/types.ts src/lib/ai/llm/mock.ts src/lib/ai/llm/anthropic.ts tests/unit/ai/ocr-page.test.ts
git commit -m "feat(002-f2): LLMProvider.ocrPage multimodal OCR (R2/FR-008)"
```

---

## Task 4: Rasterizador de página (isolado/injetável)

> Ponto de risco A1/D31: a rasterização real depende do backend de canvas do `unpdf` no
> Node. Fica **isolada** num módulo e é **injetável** no worker — a lógica do worker é
> testada com um rasterizador falso; a rasterização real é validada contra PDFs escaneados
> reais (calibração D31). Falha de rasterização de uma página é tratada como falha de
> sub-passo (→ `partial`), não derruba o PDF nem o job.

**Files:**
- Create: `src/lib/documents/rasterize.ts`

- [ ] **Step 1: Implementar o rasterizador real (sem teste unitário de rede/canvas)**

Create `src/lib/documents/rasterize.ts`:

```ts
import { renderPageAsImage } from "unpdf";

export interface RasterizedPage {
  imageBase64: string;
  mediaType: "image/png";
}

/**
 * Rasteriza uma página do PDF em PNG base64 para OCR multimodal (R2).
 * Tipo da função de seam injetada no worker (permite fake nos testes).
 * A implementação real depende do backend de canvas do unpdf no Node — CALIBRAR
 * contra PDFs escaneados reais (D31). Erros aqui viram falha de sub-passo no worker.
 */
export type RasterizePage = (bytes: Uint8Array, page: number) => Promise<RasterizedPage>;

export const rasterizePage: RasterizePage = async (bytes, page) => {
  const result = await renderPageAsImage(bytes, page, { scale: 2 });
  const buf = Buffer.from(result as ArrayBuffer);
  return { imageBase64: buf.toString("base64"), mediaType: "image/png" };
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

> Se a assinatura de `renderPageAsImage` divergir da versão instalada do `unpdf`,
> ajustar a conversão para base64 conforme o retorno real (ArrayBuffer/Uint8Array).
> Não bloquear: a lógica do worker (Task 5/6) não depende deste módulo nos testes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/documents/rasterize.ts
git commit -m "feat(002-f2): page rasterizer for OCR (unpdf renderPageAsImage, D31 seam)"
```

---

## Task 5: Worker do pipeline — `processPdfPipelineJob`

> Espelha `src/lib/screening/worker.ts`. 1 `job_item` = 1 PDF; páginas como sub-passos.
> Resiliência: PDF que não abre/baixa ⇒ item `failed` + `document.failed`; páginas que
> falham (OCR) ⇒ `document.partial`, item `done`. Commit por item ⇒ retomável (só pega
> itens `pending`/`failed`).

**Files:**
- Create: `src/lib/documents/pipeline-worker.ts`
- Test: coberto na Task 6 (integração)

- [ ] **Step 1: Implementar o worker**

Create `src/lib/documents/pipeline-worker.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { extractNativeText, isScannedPage, DEFAULT_SCAN_THRESHOLD } from "./extract";
import { rasterizePage as defaultRasterize, type RasterizePage } from "./rasterize";

interface PipelineItem {
  id: string;
  payload: { document_id: string };
  review_id: string;
  attempts: number;
}

export interface PipelineWorkerDeps {
  supabase: SupabaseClient; // service-role (bypassa RLS p/ Storage + writes)
  provider: LLMProvider;
  rasterize?: RasterizePage; // injetável p/ testes (default: unpdf)
  scanThreshold?: number; // injetável p/ calibração (default: DEFAULT_SCAN_THRESHOLD)
}

export interface PipelineWorkerResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/**
 * Processa um job pdf_text_pipeline item-a-item (§VIII): baixa o PDF do Storage,
 * extrai texto nativo por página, faz OCR multimodal nas páginas escaneadas, grava
 * text_layer (origin nativo|ocr_ia) e atualiza document.processing_status + page_count.
 * Resiliente por-item/página; retomável (só pega job_item 'pending').
 */
export async function processPdfPipelineJob(
  deps: PipelineWorkerDeps,
  jobId: string,
): Promise<PipelineWorkerResult> {
  const { supabase, provider } = deps;
  const rasterize = deps.rasterize ?? defaultRasterize;
  const threshold = deps.scanThreshold ?? DEFAULT_SCAN_THRESHOLD;

  await supabase
    .from("job")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  const { data: items, error } = await supabase
    .from("job_item")
    .select("id, payload, review_id, attempts")
    .eq("job_id", jobId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  for (const it of (items ?? []) as PipelineItem[]) {
    const documentId = it.payload.document_id;
    try {
      await supabase
        .from("document")
        .update({ processing_status: "processing" })
        .eq("id", documentId);

      const { data: doc, error: docErr } = await supabase
        .from("document")
        .select("storage_path")
        .eq("id", documentId)
        .single();
      if (docErr) throw new Error(docErr.message);

      const dl = await supabase.storage.from("pdfs").download(doc!.storage_path);
      if (dl.error) throw new Error(dl.error.message);
      const bytes = new Uint8Array(await dl.data.arrayBuffer());

      const { totalPages, pages } = await extractNativeText(bytes);
      let pageFailures = 0;

      for (const p of pages) {
        try {
          let content = p.content;
          let origin: "nativo" | "ocr_ia" = "nativo";
          if (isScannedPage(p.content, threshold)) {
            const img = await rasterize(bytes, p.page);
            const ocr = await provider.ocrPage({
              imageBase64: img.imageBase64,
              mediaType: img.mediaType,
              page: p.page,
            });
            content = ocr.output.text;
            origin = "ocr_ia";
          }
          const { error: tlErr } = await supabase.from("text_layer").insert({
            review_id: it.review_id,
            document_id: documentId,
            page: p.page,
            char_start: 0,
            char_end: content.length,
            content,
            origin,
          });
          if (tlErr) throw new Error(tlErr.message);
        } catch {
          pageFailures += 1; // página falha não derruba o PDF (→ partial)
        }
      }

      const status = pageFailures > 0 ? "partial" : "text_ready";
      await supabase
        .from("document")
        .update({ processing_status: status, page_count: totalPages })
        .eq("id", documentId);

      await supabase.from("job_item").update({ status: "done" }).eq("id", it.id);
    } catch (e) {
      // Falha estrutural (download/abertura do PDF): item failed + document failed.
      await supabase
        .from("document")
        .update({ processing_status: "failed" })
        .eq("id", documentId);
      await supabase
        .from("job_item")
        .update({
          status: "failed",
          error: (e as Error).message,
          attempts: (it.attempts ?? 0) + 1,
        })
        .eq("id", it.id);
    }
  }

  const { data: counts, error: cErr } = await supabase
    .from("job_item")
    .select("status")
    .eq("job_id", jobId);
  if (cErr) throw new Error(cErr.message);

  const all = (counts ?? []) as { status: string }[];
  const total = all.length;
  const done = all.filter((i) => i.status === "done").length;
  const failed = all.filter((i) => i.status === "failed").length;
  const status =
    failed > 0 ? (done > 0 ? "completed_with_errors" : "failed") : "completed";

  await supabase
    .from("job")
    .update({
      status,
      progress: total ? Math.round((done / total) * 100) : 100,
    })
    .eq("id", jobId);

  return { job_id: jobId, status, done, failed };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/documents/pipeline-worker.ts
git commit -m "feat(002-f2): pdf_text_pipeline worker — native+OCR per page, resilient (FR-006/007/008)"
```

---

## Task 6: Runner `runPdfPipelineWorkerWith` + testes de integração

**Files:**
- Create: `src/lib/documents/run.ts`
- Test: `tests/integration/pdf-pipeline.test.ts`

- [ ] **Step 1: Implementar o runner**

Create `src/lib/documents/run.ts` (espelha `src/lib/screening/run.ts`):

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processPdfPipelineJob, type PipelineWorkerDeps } from "./pipeline-worker";

/**
 * Processa todos os jobs pdf_text_pipeline ativos da Revisão (espelha o screening).
 * Recebe o client (service-role) e o provider já resolvidos. `extra` permite injetar
 * rasterizador/limiar nos testes.
 */
export async function runPdfPipelineWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
  extra?: Pick<PipelineWorkerDeps, "rasterize" | "scanThreshold">,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "pdf_text_pipeline")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processPdfPipelineJob({ supabase, provider, ...extra }, j.id);
  }
}
```

- [ ] **Step 2: Escrever os testes de integração (falham primeiro)**

Create `tests/integration/pdf-pipeline.test.ts`. Helpers `signUpUser`/`serviceClient` já existem
(`tests/integration/helpers/supabase`). Estes testes batem na camada de dados direto e injetam
um rasterizador falso (sem canvas/rede).

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { processPdfPipelineJob } from "@/lib/documents/pipeline-worker";
import { runPdfPipelineWorkerWith } from "@/lib/documents/run";

const fakeRasterize = async (_b: Uint8Array, page: number) => ({
  imageBase64: "ZmFrZQ==",
  mediaType: "image/png" as const,
});

/** Cria review + record included_ft e anexa um PDF (via RPC), devolvendo ids. */
async function seedDocument(
  owner: Awaited<ReturnType<typeof signUpUser>>["client"],
  reviewId: string,
  bytes: Uint8Array,
) {
  const svc = serviceClient();
  const { data: rec } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      source_format: "ris",
      raw: {},
      metadata: { title: "Estudo PDF" },
      title_norm: "estudo pdf",
      corpus_state: "included_ft",
    })
    .select("id")
    .single();
  const recordId = rec!.id as string;
  const documentId = crypto.randomUUID();
  const storagePath = `review/${reviewId}/record/${recordId}/${documentId}.pdf`;
  const up = await svc.storage
    .from("pdfs")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(up.error.message);
  const { data: job, error } = await owner.rpc("create_pdf_pipeline_job", {
    p_review_id: reviewId,
    p_record_id: recordId,
    p_document_id: documentId,
    p_storage_path: storagePath,
    p_filename: "estudo.pdf",
    p_byte_size: bytes.byteLength,
  });
  if (error) throw new Error(error.message);
  return { recordId, documentId, jobId: (job as { job_id: string }).job_id };
}

const samplePdf = () =>
  new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/sample.pdf")));

describe("pdf_text_pipeline — PDF nativo (FR-007/008)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let documentId: string;
  let jobId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`pdf_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Pipeline" });
    reviewId = review.id;
    ({ documentId, jobId } = await seedDocument(owner, reviewId, samplePdf()));
  });

  it("grava text_layer origin='nativo' e move document p/ text_ready com page_count", async () => {
    const svc = serviceClient();
    await processPdfPipelineJob(
      { supabase: svc, provider: new MockLLMProvider(), rasterize: fakeRasterize },
      jobId,
    );
    const { data: layers } = await svc
      .from("text_layer")
      .select("origin, page")
      .eq("document_id", documentId);
    expect((layers ?? []).length).toBeGreaterThanOrEqual(1);
    expect(layers!.every((l) => l.origin === "nativo")).toBe(true);

    const { data: doc } = await svc
      .from("document")
      .select("processing_status, page_count")
      .eq("id", documentId)
      .single();
    expect(doc!.processing_status).toBe("text_ready");
    expect(doc!.page_count).toBeGreaterThanOrEqual(1);
  });
});

describe("pdf_text_pipeline — página escaneada → OCR (origin='ocr_ia')", () => {
  it("limiar alto força todas as páginas a OCR via provider", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`ocr_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "OCR" });
    const reviewId = review.id;
    const { documentId, jobId } = await seedDocument(owner, reviewId, samplePdf());
    const svc = serviceClient();
    await processPdfPipelineJob(
      {
        supabase: svc,
        provider: new MockLLMProvider(),
        rasterize: fakeRasterize,
        scanThreshold: 100000, // força isScannedPage=true em toda página
      },
      jobId,
    );
    const { data: layers } = await svc
      .from("text_layer")
      .select("origin, content")
      .eq("document_id", documentId);
    expect(layers!.length).toBeGreaterThanOrEqual(1);
    expect(layers!.every((l) => l.origin === "ocr_ia")).toBe(true);
    expect(layers![0]!.content).toContain("[OCR p.1]");
  });
});

describe("pdf_text_pipeline — resiliência por-item + retomável (FR-006)", () => {
  it("PDF inválido ⇒ document.failed + job_item failed; PDF válido na mesma fila ⇒ done", async () => {
    const s = Date.now();
    const owner = (await signUpUser(`res_${s}@example.com`, "senha-teste-123")).client;
    const { data: review } = await owner.rpc("create_review", { p_title: "Resiliência" });
    const reviewId = review.id;
    const bad = await seedDocument(owner, reviewId, new Uint8Array([1, 2, 3, 4]));
    const good = await seedDocument(owner, reviewId, samplePdf());
    const svc = serviceClient();

    await runPdfPipelineWorkerWith(svc, new MockLLMProvider(), reviewId, {
      rasterize: fakeRasterize,
    });

    const docBad = await svc
      .from("document")
      .select("processing_status")
      .eq("id", bad.documentId)
      .single();
    const docGood = await svc
      .from("document")
      .select("processing_status")
      .eq("id", good.documentId)
      .single();
    expect(docBad.data!.processing_status).toBe("failed");
    expect(["text_ready", "partial"]).toContain(docGood.data!.processing_status);

    // Job do PDF bom termina sem falha estrutural do job; job do ruim sinaliza falha.
    const { data: badJob } = await svc
      .from("job")
      .select("status")
      .eq("id", bad.jobId)
      .single();
    expect(["failed", "completed_with_errors"]).toContain(badJob!.status);
  });
});

describe("pdf_text_pipeline — RLS de text_layer (SC-011)", () => {
  it("membro de outra Revisão não lê text_layer alheio", async () => {
    const s = Date.now();
    const a = (await signUpUser(`tla_${s}@example.com`, "senha-teste-123")).client;
    const b = (await signUpUser(`tlb_${s}@example.com`, "senha-teste-123")).client;
    const { data: reviewA } = await a.rpc("create_review", { p_title: "A" });
    const reviewId = reviewA.id;
    const { documentId, jobId } = await seedDocument(a, reviewId, samplePdf());
    await processPdfPipelineJob(
      { supabase: serviceClient(), provider: new MockLLMProvider(), rasterize: fakeRasterize },
      jobId,
    );
    const { data: seenByB } = await b
      .from("text_layer")
      .select("id")
      .eq("document_id", documentId);
    expect((seenByB ?? []).length).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar os testes e ver falhar/passar**

Run: `npx vitest run tests/integration/pdf-pipeline.test.ts`
Expected: tudo PASS (após o runner existir). Se a fixture `sample.pdf` tiver só texto
nativo, o teste de OCR usa `scanThreshold` alto para forçar o caminho `ocr_ia`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/documents/run.ts tests/integration/pdf-pipeline.test.ts
git commit -m "test(002-f2): pdf pipeline worker integration — native/OCR/partial/RLS (FR-006/007/008, SC-011)"
```

---

## Task 7: Server Action `runPdfPipelineWorker` + disparo no painel

**Files:**
- Modify: `app/reviews/[reviewId]/workbench/actions.ts`
- Modify: `src/components/documents/DocumentsPanel.tsx`

- [ ] **Step 1: Adicionar a Server Action**

In `app/reviews/[reviewId]/workbench/actions.ts`, add the import near the other lib imports:

```ts
import { runPdfPipelineWorkerWith } from "@/lib/documents/run";
```

And add the action (after `runScreeningWorker`, espelhando-o):

```ts
export async function runPdfPipelineWorker(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  void supabase; // membership checada; o worker usa service-role
  const admin = createAdminClient();
  // Provider: BYOK quando há chave; senão Mock determinístico (local/e2e).
  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) provider = new MockLLMProvider();
    else throw e;
  }
  await runPdfPipelineWorkerWith(admin, provider, reviewId);
  revalidatePath(`/reviews/${reviewId}/workbench`);
  return { ok: true as const };
}
```

- [ ] **Step 2: Disparar o worker após upload no painel**

In `src/components/documents/DocumentsPanel.tsx`, after a successful `attachPdf` (where the
panel currently re-fetches the list / invalidates the query), call the new action so o PDF
recém-anexado seja processado, mantendo o polling de status já existente. Concretely, where
the upload handler awaits `attachPdf(...)` and checks `res.ok`, add:

```tsx
// após upload OK: dispara o pipeline (fire-and-forget; o status é observado por polling)
await runPdfPipelineWorker(reviewId);
```

Import the action at the top of the file alongside the existing `attachPdf`/`fetchDocuments`
imports:

```tsx
import { runPdfPipelineWorker } from "@/app/reviews/[reviewId]/workbench/actions";
```

> Se o `DocumentsPanel` receber as ações por props (padrão da Fatia 1, ver
> `workbench/page.tsx` wiring), adicionar `runPdfPipelineWorker` como prop opcional e
> passá-la no `page.tsx`, em vez de importar diretamente — seguir o padrão de wiring
> existente da Fatia 1 (não refragmentar; Princípio V).

- [ ] **Step 3: Verificação de portões**

Run:
```bash
npm run lint && npx tsc --noEmit && npx vitest run
```
Expected: lint limpo; 0 erros de tipo; toda a suíte verde (baseline da Fatia 1 + novos testes da Fatia 2).

- [ ] **Step 4: Commit**

```bash
git add app/reviews/[reviewId]/workbench/actions.ts src/components/documents/DocumentsPanel.tsx
git commit -m "feat(002-f2): runPdfPipelineWorker action + trigger after upload (US1-B)"
```

---

## Self-Review (cobertura da spec)

| Requisito (Fatia 2 / slicing) | Coberto por |
|---|---|
| **FR-006** (worker retomável, resiliente por-item) | Task 5 (commit por item, só pega `pending`) + Task 6 (teste de resiliência/retomável) |
| **FR-007** (extração nativa determinística + híbrido) | Task 2 (`extractNativeText`) + Task 5 (nativo/OCR por densidade) |
| **FR-008** (`text_layer.origin` nativo/ocr_ia, página 1-based) | Task 1 (enum/schema) + Task 5 (gravação) + Task 6 (asserts de `origin`) |
| **FR-005** (encerra a parte assíncrona: trabalho pesado no worker, §VIII) | Task 5 (download+parse no worker, nunca inline) |
| **A1** (lib nativa + limiar de densidade, calibrar D31) | Task 2 (`unpdf` por tarefa explícita, `DEFAULT_SCAN_THRESHOLD` calibrável) |
| **R2** (OCR multimodal via `LLMProvider`) | Task 3 (`ocrPage`) + Task 4 (rasterizador) + Task 5 (caminho OCR) |
| State machine `processing_status` (queued→processing→text_ready/partial/failed) | Task 5 (transições) + Task 6 (asserts de estado) |
| Isolamento por Revisão (SC-011) | Task 1 (RLS `text_layer`) + Task 6 (teste RLS) |

**Pontos sinalizados para calibração (não bloqueiam a fatia, D31):** o valor real de
`DEFAULT_SCAN_THRESHOLD` e a assinatura exata de `unpdf` (`extractText` per-página e
`renderPageAsImage`) devem ser validados contra PDFs reais do corpus na execução; ambos
estão isolados atrás de seams injetáveis para não acoplar a lógica do worker.

---

## Regime / CHECKPOINT 3

Ao concluir as 7 tasks no branch isolado `build/002-marco2-coracao-ai-first/2-pipeline-texto`:
**PARAR** e apresentar ao desenvolvedor — branch, diff, e evidência de
`npm run lint` + `npx tsc --noEmit` + `npx vitest run` (+ e2e se aplicável). Escrever
`COMPLETION-fatia-2.md` em `.superpowers/`, atualizar a tabela "Estado de execução das
fatias" no `slicing.md`, e **aguardar o merge manual** do desenvolvedor antes da Fatia 3.
**Nunca** `merge`/`push` para a feature ou `main`.
