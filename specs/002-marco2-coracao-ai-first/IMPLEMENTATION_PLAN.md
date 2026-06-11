# Fatia 5 — Extração em lote + estimativa de custo + consumo (US4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sobre uma seleção de estudos (`record` com `corpus_state='included_ft'` que têm PDF processado), o pesquisador aciona a **extração por IA em lote** como **job assíncrono** (progresso visível, retomável, resiliente a falha por-item); **antes** de executar vê uma **estimativa de custo/tokens** e confirma; o **consumo acumulado por Revisão e por fase** fica visível. Sem 1ª chave BYOK ⇒ sinaliza, mas não trava (extração manual da Fatia 4 segue disponível).

**Architecture:** Espelha o caminho de IA do Marco 1 (screening batch) — **server-side Node**, provider injetado (A1). O lote reusa **integralmente** a unidade de extração da Fatia 4 (`runExtractionForRecord`): cada `job_item` é **um estudo**. Enqueue via **RPC `security definer` auditada** (`create_extraction_job`, espelha `create_screening_job`); worker `processExtractionJob` item-a-item (espelha `processScreeningJob`), escrita via **client service-role** (admin, bypassa RLS). A estimativa de custo usa o contrato `LLMProvider.estimateCost({kind:'ai_extraction_batch', …})` (já entregue na Fatia 4). O consumo por fase soma `ai_usage` agrupado por `phase`. UI: novo painel `ExtractionBatchRunner` na página de Extração + linha por-fase no `JobsPanel`.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), Supabase (Postgres+RLS, RPC security-definer, enum `job_type` aditivo), `@anthropic-ai/sdk` via abstração `LLMProvider` (+ `MockLLMProvider` para local/e2e), Vitest (unit + integration que batem direto no DB), Testing Library.

**Não-regressão (Marco ≥ 2):** nenhuma refatoração de screening/import/workbench. Tudo é **aditivo**: enum `ai_extraction_batch` (`ALTER … ADD VALUE`), novas libs em `src/lib/extraction/`, extensão de `src/lib/shell/usage.ts` (nova função + campo novo, sem quebrar `summarizeUsage`/`getJobsAndUsage` existentes), novo componente, novas Server Actions na `actions.ts` existente.

**Fora de escopo / deferido:** o polimento de UX herdado da Fatia 4 (ocultar "Aceitar" numa sugestão `not_found` no `ExtractionRunner`) **não** é requisito da Fatia 5 (US4 = FR-021/022/023) e **não** entra aqui — é cosmético, sem risco de integridade (registrado em `COMPLETION-fatia-4.md`); fica para um passe de polimento posterior.

---

## File Structure

**Criar:**
- `supabase/migrations/0016_extraction_batch.sql` — `ALTER TYPE job_type ADD VALUE 'ai_extraction_batch'` (aditivo) + RPC `create_extraction_job(p_review_id, p_record_ids jsonb)` (security definer, audita `enqueue_extraction_batch`). Elegibilidade: `corpus_state='included_ft'` **e** existe `document` com `processing_status ∈ {text_ready, partial}`.
- `src/lib/extraction/enqueue.ts` — `enqueueExtractionJob(deps, reviewId, recordIds)`: chama a RPC e conta os `job_item`. **Não** processa (§VIII).
- `src/lib/extraction/batch-worker.ts` — `processExtractionJob(deps, jobId)`: por item = 1 estudo; chama `runExtractionForRecord`; grava `ai_usage(phase='extraction', job_id)`; resiliente por-item; retomável (só pega `pending`); atualiza `status`/`progress` do job.
- `src/lib/extraction/batch-run.ts` — `runExtractionBatchWorkerWith(supabase, provider, reviewId)`: processa os jobs `ai_extraction_batch` ativos (espelha `runScreeningWorkerWith`).
- `src/components/extraction/ExtractionBatchRunner.tsx` — painel client: lista candidatos com checkbox, botão **Estimar custo** (FR-022), confirmação **Extrair em lote** (só habilita após estimativa), resumo do resultado.
- `tests/integration/extraction-batch.test.ts` — RPC (elegibilidade + audit), worker (done + `ai_usage`, falha por-item não derruba o lote, retomável).
- `tests/integration/rls.extraction-batch.test.ts` — isolamento cross-review de `job`/`job_item`/`ai_usage` (SC-011 análogo).
- `tests/unit/shell/usage-by-phase.test.ts` — `summarizeUsageByPhase` (pura).

**Modificar:**
- `src/lib/extraction/queries.ts` — adicionar `listExtractionBatchCandidates(deps, reviewId)` (estudos `included_ft` com PDF processado, deduplicados).
- `src/lib/shell/usage.ts` — adicionar `PhaseUsage` + `summarizeUsageByPhase` + estender `getJobsAndUsage` com `usageByPhase` (FR-023). **Sem** alterar `summarizeUsage`/assinaturas existentes.
- `src/components/shell/JobsPanel.tsx` — renderizar consumo por fase (pt-BR).
- `app/reviews/[reviewId]/extraction/actions.ts` — `estimateExtractionBatch(reviewId, recordIds)` (FR-022, sem efeito colateral) + `runExtractionBatch(reviewId, recordIds)` (enqueue + run, A1).
- `app/reviews/[reviewId]/extraction/page.tsx` — carregar candidatos e renderizar `ExtractionBatchRunner`.
- `src/types/database.ts` — regenerado via `npm run gen:types` após a migration (enum + RPC novos).

---

## Task 1: Migration 0016 — enum `ai_extraction_batch` + RPC `create_extraction_job`

**Files:**
- Create: `supabase/migrations/0016_extraction_batch.sql`
- Modify (gerado): `src/types/database.ts`

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/0016_extraction_batch.sql` com exatamente:

```sql
-- ============================================================
-- Marco 2 / Fatia 5 — Extração por IA em lote (US4 / FR-021..023).
-- Aditivo (não-regressão Marco ≥ 2): novo valor de enum job_type + RPC de enqueue.
-- A RPC só ENFILEIRA (cria job + job_item); o trabalho pesado roda no worker
-- server-side Node (§VIII / A1). Espelha create_screening_job (0006).
-- Elegibilidade: estudo no Texto completo (included_ft) com PDF já processado.
-- O literal 'ai_extraction_batch' é usado só em RUNTIME (corpo plpgsql), não nesta
-- transação — mesmo padrão de 0015 (alter type + create function no mesmo arquivo).
-- ============================================================

-- job_type ganha 'ai_extraction_batch' (aditivo; usado em runtime).
alter type job_type add value if not exists 'ai_extraction_batch';

-- ---------- RPC: create_extraction_job (enqueue de lote — FR-021) ----------
create or replace function public.create_extraction_job(
  p_review_id uuid,
  p_record_ids jsonb default null
)
returns public.job
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.job;
  v_count int;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'ai_extraction_batch', 'queued')
  returning * into v_job;

  -- Um job_item por estudo elegível: incluído no Texto completo (included_ft) E
  -- com PDF processado (text_ready/partial). Mesmo predicado de
  -- listExtractionBatchCandidates (Task 5) — manter os dois em sincronia.
  insert into public.job_item (job_id, review_id, status, payload)
  select v_job.id, p_review_id, 'pending', jsonb_build_object('record_id', r.id)
  from public.record r
  where r.review_id = p_review_id
    and r.corpus_state = 'included_ft'
    and exists (
      select 1 from public.document d
      where d.record_id = r.id
        and d.processing_status in ('text_ready', 'partial')
    )
    and (
      p_record_ids is null
      or r.id::text in (select jsonb_array_elements_text(p_record_ids))
    );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'enqueue_extraction_batch', 'job', v_job.id,
    null, jsonb_build_object('item_count', v_count)
  );

  return v_job;
end;
$$;

grant execute on function public.create_extraction_job(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Aplicar a migration localmente**

Run: `npx supabase db reset`
Expected: aplica `0001`–`0016` sem erro; a saída termina em sucesso (sem `ERROR:`).

- [ ] **Step 3: Smoke-check do enum e da função no banco**

Run:
```bash
npx supabase db reset >/dev/null 2>&1 && \
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c \
"select unnest(enum_range(null::job_type))::text as t order by 1; \
 select proname from pg_proc where proname='create_extraction_job';"
```
Expected: a lista de `t` inclui `ai_extraction_batch`; `proname` retorna `create_extraction_job`.
(Se `psql` não estiver disponível no ambiente, pule este passo — o Step 2 já prova que a migration aplica; a Task 2 cobre o comportamento via teste de integração.)

- [ ] **Step 4: Regenerar os tipos do banco**

Run: `npm run gen:types`
Expected: `src/types/database.ts` passa a conter `"ai_extraction_batch"` no union `job_type` e a entrada `create_extraction_job` em `Functions`.

Verificação rápida:
Run: `grep -c 'ai_extraction_batch' src/types/database.ts`
Expected: ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_extraction_batch.sql src/types/database.ts
git commit -m "feat(002-f5): migration 0016 ai_extraction_batch enum + create_extraction_job RPC (US4/FR-021)"
```

---

## Task 2: Enqueue lib — `enqueueExtractionJob`

**Files:**
- Create: `src/lib/extraction/enqueue.ts`
- Test: `tests/integration/extraction-batch.test.ts`

- [ ] **Step 1: Escrever o teste que falha (enqueue cria job + job_item dos elegíveis)**

Crie `tests/integration/extraction-batch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueExtractionJob } from "@/lib/extraction/enqueue";

/** Cria Revisão + estudo included_ft com PDF processado + text_layer + form (1 campo). */
async function seedStudy(
  svc: SupabaseClient,
  reviewId: string,
  opts: { processed?: boolean; title?: string } = {},
): Promise<string> {
  const { data: rec } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      corpus_state: "included_ft",
      source_format: "ris",
      raw: {},
      metadata: { title: opts.title ?? "Estudo" },
    })
    .select("id")
    .single();
  const recordId = rec!.id as string;
  if (opts.processed !== false) {
    const { data: doc } = await svc
      .from("document")
      .insert({
        review_id: reviewId,
        record_id: recordId,
        storage_path: `review/${reviewId}/record/${recordId}/d.pdf`,
        filename: "d.pdf",
        byte_size: 10,
        processing_status: "text_ready",
      })
      .select("id")
      .single();
    await svc.from("text_layer").insert({
      review_id: reviewId,
      document_id: doc!.id,
      page: 1,
      char_start: 0,
      char_end: 28,
      content: "Amostra de 42 participantes.",
      origin: "nativo",
    });
  }
  return recordId;
}

async function setup() {
  const { client } = await signUpUser(
    `eb_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    "senha-teste-123",
  );
  const { data: review } = await client.rpc("create_review", {
    p_title: "Extração lote",
  });
  const reviewId = review!.id as string;
  const svc = serviceClient();
  await client.rpc("ensure_extraction_form", { p_review_id: reviewId });
  await client.rpc("add_extraction_field", {
    p_review_id: reviewId,
    p_name: "Amostra",
    p_type: "number",
    p_options: null,
  });
  return { client, reviewId, svc };
}

describe("enqueueExtractionJob (US4/FR-021)", () => {
  it("cria job ai_extraction_batch com um job_item por estudo elegível", async () => {
    const { client, reviewId, svc } = await setup();
    const r1 = await seedStudy(svc, reviewId, { title: "A" });
    const r2 = await seedStudy(svc, reviewId, { title: "B" });
    await seedStudy(svc, reviewId, { processed: false, title: "C" }); // sem PDF → fora

    const res = await enqueueExtractionJob({ supabase: client }, reviewId, null);
    expect(res.status).toBe("queued");
    expect(res.item_count).toBe(2); // C (sem PDF processado) não entra

    const { data: items } = await svc
      .from("job_item")
      .select("payload, status")
      .eq("job_id", res.job_id);
    const ids = (items ?? []).map(
      (i) => (i.payload as { record_id: string }).record_id,
    );
    expect(ids.sort()).toEqual([r1, r2].sort());
    expect((items ?? []).every((i) => i.status === "pending")).toBe(true);

    const { data: job } = await svc
      .from("job")
      .select("type, status")
      .eq("id", res.job_id)
      .single();
    expect(job!.type).toBe("ai_extraction_batch");
    expect(job!.status).toBe("queued");
  });

  it("respeita a seleção de recordIds (subconjunto)", async () => {
    const { client, reviewId, svc } = await setup();
    const r1 = await seedStudy(svc, reviewId, { title: "A" });
    await seedStudy(svc, reviewId, { title: "B" });

    const res = await enqueueExtractionJob({ supabase: client }, reviewId, [r1]);
    expect(res.item_count).toBe(1);
    const { data: items } = await svc
      .from("job_item")
      .select("payload")
      .eq("job_id", res.job_id);
    expect((items ?? [])[0]!.payload).toMatchObject({ record_id: r1 });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `npx vitest run tests/integration/extraction-batch.test.ts`
Expected: FAIL — `Cannot find module '@/lib/extraction/enqueue'`.

- [ ] **Step 3: Implementar `enqueueExtractionJob`**

Crie `src/lib/extraction/enqueue.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExtractionEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/**
 * Cria o job ai_extraction_batch (via RPC create_extraction_job) e conta os
 * job_item enfileirados. NÃO processa itens (§VIII) — o worker server-side
 * (batch-worker.ts) faz o trabalho pesado. Espelha enqueueScreeningJob.
 * recordIds: subconjunto opcional (lote sobre seleção). A elegibilidade
 * (included_ft + PDF processado) é aplicada na RPC.
 */
export async function enqueueExtractionJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
  recordIds: string[] | null,
): Promise<ExtractionEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc(
    "create_extraction_job",
    { p_review_id: reviewId, p_record_ids: recordIds ?? null },
  );
  if (error) throw new Error(error.message);

  const { count, error: countErr } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  if (countErr) throw new Error(countErr.message);

  return { job_id: job.id, status: "queued", item_count: count ?? 0 };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/integration/extraction-batch.test.ts`
Expected: PASS (2 testes do bloco `enqueueExtractionJob`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction/enqueue.ts tests/integration/extraction-batch.test.ts
git commit -m "feat(002-f5): enqueueExtractionJob via create_extraction_job RPC (US4/FR-021)"
```

---

## Task 3: Worker do lote — `processExtractionJob` (resiliente, retomável, ai_usage)

**Files:**
- Create: `src/lib/extraction/batch-worker.ts`
- Test: `tests/integration/extraction-batch.test.ts` (acrescentar blocos)

- [ ] **Step 1: Escrever os testes que falham (done + ai_usage; falha por-item; retomável)**

No topo de `tests/integration/extraction-batch.test.ts`, adicione aos imports:
```ts
import { processExtractionJob } from "@/lib/extraction/batch-worker";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
```
Acrescente ao fim do arquivo:

```ts
describe("processExtractionJob (US4/FR-021/FR-023)", () => {
  it("processa cada estudo, grava ai_usage(phase='extraction') e fecha o job", async () => {
    const { client, reviewId, svc } = await setup();
    await seedStudy(svc, reviewId, { title: "A" });
    await seedStudy(svc, reviewId, { title: "B" });
    const enq = await enqueueExtractionJob({ supabase: client }, reviewId, null);

    const res = await processExtractionJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed");
    expect(res.done).toBe(2);
    expect(res.failed).toBe(0);

    const { data: items } = await svc
      .from("job_item")
      .select("status")
      .eq("job_id", enq.job_id);
    expect((items ?? []).every((i) => i.status === "done")).toBe(true);

    const { data: job } = await svc
      .from("job")
      .select("status, progress")
      .eq("id", enq.job_id)
      .single();
    expect(job!.status).toBe("completed");
    expect(job!.progress).toBe(100);

    // ai_usage por estudo, marcada com a fase 'extraction' e ligada ao job (FR-023).
    const { data: usage } = await svc
      .from("ai_usage")
      .select("phase, job_id")
      .eq("review_id", reviewId)
      .eq("phase", "extraction");
    expect((usage ?? []).length).toBe(2);
    expect((usage ?? []).every((u) => u.job_id === enq.job_id)).toBe(true);

    // extraction_value criado para os estudos (reusa runExtractionForRecord).
    const { count } = await svc
      .from("extraction_value")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("falha de um item não derruba o lote (completed_with_errors)", async () => {
    const { client, reviewId, svc } = await setup();
    await seedStudy(svc, reviewId, { title: "A" });
    const enq = await enqueueExtractionJob({ supabase: client }, reviewId, null);

    // job_item adicional apontando para um record inexistente → insert de
    // extraction_value viola a FK → runExtractionForRecord lança → item 'failed'.
    await svc.from("job_item").insert({
      job_id: enq.job_id,
      review_id: reviewId,
      status: "pending",
      payload: { record_id: "00000000-0000-0000-0000-000000000000" },
    });

    const res = await processExtractionJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed_with_errors");
    expect(res.done).toBe(1);
    expect(res.failed).toBe(1);

    const { data: failed } = await svc
      .from("job_item")
      .select("status, error, attempts")
      .eq("job_id", enq.job_id)
      .eq("status", "failed");
    expect((failed ?? []).length).toBe(1);
    expect((failed ?? [])[0]!.error).toBeTruthy();
    expect((failed ?? [])[0]!.attempts).toBe(1);
  });

  it("é retomável: re-rodar não reprocessa itens já 'done'", async () => {
    const { client, reviewId, svc } = await setup();
    await seedStudy(svc, reviewId, { title: "A" });
    const enq = await enqueueExtractionJob({ supabase: client }, reviewId, null);

    await processExtractionJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    const { count: after1 } = await svc
      .from("extraction_value")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);

    // Segunda execução: 0 itens 'pending' → nenhum extraction_value novo.
    const res2 = await processExtractionJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    expect(res2.done).toBe(0);
    expect(res2.failed).toBe(0);

    const { count: after2 } = await svc
      .from("extraction_value")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(after2).toBe(after1); // nada reprocessado
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run tests/integration/extraction-batch.test.ts`
Expected: FAIL — `Cannot find module '@/lib/extraction/batch-worker'`.

- [ ] **Step 3: Implementar `processExtractionJob`**

Crie `src/lib/extraction/batch-worker.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { runExtractionForRecord } from "./extract";

interface ExtractionItem {
  id: string;
  payload: { record_id: string };
  review_id: string;
  attempts: number;
}

export interface ExtractionBatchDeps {
  supabase: SupabaseClient; // service-role (admin) — escrita da IA bypassa RLS
  provider: LLMProvider;
}

export interface ExtractionBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

/**
 * Processa um job ai_extraction_batch item-a-item (§VIII / A1): cada item é UM
 * estudo; chama runExtractionForRecord (Fatia 4) e grava ai_usage(phase='extraction').
 * Falha de um item ⇒ item 'failed' (não derruba o job — FR-021). Retomável: só
 * pega itens 'pending'. Espelha processScreeningJob (Marco 1).
 */
export async function processExtractionJob(
  deps: ExtractionBatchDeps,
  jobId: string,
): Promise<ExtractionBatchResult> {
  const { supabase, provider } = deps;

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

  for (const it of (items ?? []) as ExtractionItem[]) {
    try {
      await runExtractionForRecord(
        { supabase, provider },
        it.review_id,
        it.payload.record_id,
      );

      await supabase.from("ai_usage").insert({
        review_id: it.review_id,
        phase: "extraction",
        tokens_in: 0,
        tokens_out: 0,
        cost: {},
        job_id: jobId,
      });

      await supabase
        .from("job_item")
        .update({ status: "done" })
        .eq("id", it.id);
    } catch (e) {
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

> Nota (FR-023): mantemos `tokens_in/out = 0` como no `screening/worker.ts` (a captura de tokens reais é um gap herdado do Marco 1, fora do escopo desta fatia). O valor de FR-023 vem do **agrupamento por fase** (Task 6): cada item registra uma chamada `ai_usage` com `phase='extraction'`, tornando o consumo por-fase visível e contável.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/extraction-batch.test.ts`
Expected: PASS (todos os blocos — enqueue + worker).

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction/batch-worker.ts tests/integration/extraction-batch.test.ts
git commit -m "feat(002-f5): processExtractionJob per-item resilient/resumable + ai_usage (US4/FR-021/FR-023)"
```

---

## Task 4: Run wrapper — `runExtractionBatchWorkerWith`

**Files:**
- Create: `src/lib/extraction/batch-run.ts`
- Test: `tests/integration/extraction-batch.test.ts` (acrescentar bloco)

- [ ] **Step 1: Escrever o teste que falha (processa jobs ativos da Revisão)**

No topo de `tests/integration/extraction-batch.test.ts`, adicione ao bloco de imports:
```ts
import { runExtractionBatchWorkerWith } from "@/lib/extraction/batch-run";
```
Acrescente ao fim do arquivo:

```ts
describe("runExtractionBatchWorkerWith (US4/A1)", () => {
  it("processa todos os jobs ai_extraction_batch ativos da Revisão", async () => {
    const { client, reviewId, svc } = await setup();
    await seedStudy(svc, reviewId, { title: "A" });
    const enq = await enqueueExtractionJob({ supabase: client }, reviewId, null);

    await runExtractionBatchWorkerWith(svc, new MockLLMProvider(), reviewId);

    const { data: job } = await svc
      .from("job")
      .select("status")
      .eq("id", enq.job_id)
      .single();
    expect(job!.status).toBe("completed");
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run tests/integration/extraction-batch.test.ts`
Expected: FAIL — `Cannot find module '@/lib/extraction/batch-run'`.

- [ ] **Step 3: Implementar `runExtractionBatchWorkerWith`**

Crie `src/lib/extraction/batch-run.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processExtractionJob } from "./batch-worker";

/**
 * Processa todos os jobs ai_extraction_batch ativos da Revisão. Recebe o client
 * (admin/service em produção) e o provider já resolvidos — testável e desacoplado
 * da resolução de BYOK. Espelha runScreeningWorkerWith.
 */
export async function runExtractionBatchWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job")
    .select("id")
    .eq("review_id", reviewId)
    .eq("type", "ai_extraction_batch")
    .in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processExtractionJob({ supabase, provider }, j.id);
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/extraction-batch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction/batch-run.ts tests/integration/extraction-batch.test.ts
git commit -m "feat(002-f5): runExtractionBatchWorkerWith processes active batch jobs (US4/A1)"
```

---

## Task 5: Query de candidatos — `listExtractionBatchCandidates`

**Files:**
- Modify: `src/lib/extraction/queries.ts`
- Test: `tests/integration/extraction-batch.test.ts` (acrescentar bloco)

- [ ] **Step 1: Escrever o teste que falha (só estudos included_ft com PDF processado, sem duplicar)**

No topo de `tests/integration/extraction-batch.test.ts`, adicione ao bloco de imports:
```ts
import { listExtractionBatchCandidates } from "@/lib/extraction/queries";
```
Acrescente ao fim do arquivo:

```ts
describe("listExtractionBatchCandidates (US4)", () => {
  it("lista só estudos included_ft com PDF processado, deduplicados por estudo", async () => {
    const { client, reviewId, svc } = await setup();
    const r1 = await seedStudy(svc, reviewId, { title: "Com PDF" });
    await seedStudy(svc, reviewId, { processed: false, title: "Sem PDF" });

    // 2º PDF processado no mesmo estudo r1 → não pode duplicar r1 na lista.
    await svc.from("document").insert({
      review_id: reviewId,
      record_id: r1,
      storage_path: `review/${reviewId}/record/${r1}/d2.pdf`,
      filename: "d2.pdf",
      byte_size: 10,
      processing_status: "text_ready",
    });

    const candidates = await listExtractionBatchCandidates(
      { supabase: client },
      reviewId,
    );
    expect(candidates.map((c) => c.id)).toEqual([r1]); // só r1, uma vez
    expect(candidates[0]!.title).toBe("Com PDF");
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run tests/integration/extraction-batch.test.ts`
Expected: FAIL — `listExtractionBatchCandidates is not a function` / não exportada.

- [ ] **Step 3: Implementar a query**

Em `src/lib/extraction/queries.ts`, logo após a função `listStudies` (e reusando a interface `StudyRow` já existente no arquivo), acrescente:

```ts
/**
 * Estudos elegíveis para extração em lote (US4): included_ft COM PDF processado
 * (text_ready/partial). Mesmo predicado da RPC create_extraction_job — manter em
 * sincronia. Um estudo com >1 PDF processado aparece uma única vez (dedupe).
 */
export async function listExtractionBatchCandidates(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<StudyRow[]> {
  const { data, error } = await deps.supabase
    .from("record")
    .select("id, metadata, document!inner(processing_status)")
    .eq("review_id", reviewId)
    .eq("corpus_state", "included_ft")
    .in("document.processing_status", ["text_ready", "partial"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const seen = new Set<string>();
  const out: StudyRow[] = [];
  for (const r of (data ?? []) as Array<{
    id: string;
    metadata: { title?: string } | null;
  }>) {
    if (seen.has(r.id)) continue; // dedupe: inner-join repete o estudo por documento
    seen.add(r.id);
    out.push({ id: r.id, title: r.metadata?.title ?? "(sem título)" });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/extraction-batch.test.ts`
Expected: PASS (todos os blocos do arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction/queries.ts tests/integration/extraction-batch.test.ts
git commit -m "feat(002-f5): listExtractionBatchCandidates (included_ft + processed PDF) (US4)"
```

---

## Task 6: Consumo por fase (FR-023) — `summarizeUsageByPhase` + JobsPanel

**Files:**
- Modify: `src/lib/shell/usage.ts`
- Modify: `src/components/shell/JobsPanel.tsx`
- Test: `tests/unit/shell/usage-by-phase.test.ts`

- [ ] **Step 1: Escrever o teste unitário que falha (agregação pura por fase)**

Crie `tests/unit/shell/usage-by-phase.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeUsageByPhase } from "@/lib/shell/usage";

describe("summarizeUsageByPhase (FR-023)", () => {
  it("agrupa tokens e conta chamadas por fase, ordenado por fase", () => {
    const rows = [
      { phase: "screening", tokens_in: 10, tokens_out: 5 },
      { phase: "extraction", tokens_in: 0, tokens_out: 0 },
      { phase: "extraction", tokens_in: 0, tokens_out: 0 },
      { phase: "screening", tokens_in: 3, tokens_out: null },
    ];
    const out = summarizeUsageByPhase(rows);
    expect(out).toEqual([
      { phase: "extraction", tokensIn: 0, tokensOut: 0, calls: 2 },
      { phase: "screening", tokensIn: 13, tokensOut: 5, calls: 2 },
    ]);
  });

  it("retorna [] para entrada vazia", () => {
    expect(summarizeUsageByPhase([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npx vitest run tests/unit/shell/usage-by-phase.test.ts`
Expected: FAIL — `summarizeUsageByPhase` não exportada.

- [ ] **Step 3: Estender `src/lib/shell/usage.ts`**

Em `src/lib/shell/usage.ts`, **adicione** (sem alterar `summarizeUsage`, `AiUsageSummary` nem as assinaturas existentes):

1. Nova interface + função pura (após `summarizeUsage`):

```ts
export interface PhaseUsage {
  phase: string;
  tokensIn: number;
  tokensOut: number;
  calls: number;
}

/** Consumo por fase (FR-023): soma tokens e conta chamadas de ai_usage por phase. */
export function summarizeUsageByPhase(
  rows: { phase: string; tokens_in: number | null; tokens_out: number | null }[],
): PhaseUsage[] {
  const map = new Map<string, PhaseUsage>();
  for (const r of rows) {
    const cur = map.get(r.phase) ?? {
      phase: r.phase,
      tokensIn: 0,
      tokensOut: 0,
      calls: 0,
    };
    cur.tokensIn += r.tokens_in ?? 0;
    cur.tokensOut += r.tokens_out ?? 0;
    cur.calls += 1;
    map.set(r.phase, cur);
  }
  return [...map.values()].sort((a, b) => a.phase.localeCompare(b.phase));
}
```

2. Estenda a interface `JobsAndUsage` com o novo campo:

```ts
export interface JobsAndUsage {
  jobs: JobRow[];
  usage: AiUsageSummary;
  usageByPhase: PhaseUsage[];
}
```

3. Em `getJobsAndUsage`, selecione também `phase` e calcule o breakdown. Substitua o trecho da query/retorno (a partir de `const { data, error } = await supabase.from("ai_usage")…`) por:

```ts
  const { data, error } = await supabase
    .from("ai_usage")
    .select("phase, tokens_in, tokens_out")
    .eq("review_id", reviewId);
  if (error) throw new Error(error.message);
  const allRows = (data ?? []) as {
    phase: string;
    tokens_in: number | null;
    tokens_out: number | null;
  }[];
  return {
    jobs,
    usage: summarizeUsage(allRows),
    usageByPhase: summarizeUsageByPhase(allRows),
  };
```

- [ ] **Step 4: Rodar o teste unitário e confirmar que passa**

Run: `npx vitest run tests/unit/shell/usage-by-phase.test.ts`
Expected: PASS.

- [ ] **Step 5: Renderizar o consumo por fase no `JobsPanel`**

Em `src/components/shell/JobsPanel.tsx`:

1. Adicione, logo após a linha `const ACTIVE = ["queued", "running"];`:

```tsx
const PHASE_LABELS: Record<string, string> = {
  screening: "Triagem",
  extraction: "Extração",
  embedding: "Embeddings",
};
```

2. Substitua o primeiro `<div className="panel">` (o bloco "Consumo de IA — entrada …") por:

```tsx
      <div className="panel">
        <div>
          Consumo de IA — entrada: <strong>{data.usage.tokensIn}</strong> tokens
          · saída: <strong>{data.usage.tokensOut}</strong> tokens
        </div>
        {data.usageByPhase.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-soft">
            {data.usageByPhase.map((p) => (
              <li key={p.phase}>
                {PHASE_LABELS[p.phase] ?? p.phase}:{" "}
                <strong>{p.calls}</strong> chamada(s) · {p.tokensIn}/
                {p.tokensOut} tokens
              </li>
            ))}
          </ul>
        )}
      </div>
```

- [ ] **Step 6: Verificar tipos e lint do que mudou**

Run: `npm run typecheck && npm run lint`
Expected: sem erros. (`layout.tsx` consome `getJobsAndUsage` e o `JobsPanel` recebe `usageByPhase`, sempre fornecido por `getJobsAndUsage`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/shell/usage.ts src/components/shell/JobsPanel.tsx tests/unit/shell/usage-by-phase.test.ts
git commit -m "feat(002-f5): consumo de IA por fase no shell (US4/FR-023)"
```

---

## Task 7: Server Actions — `estimateExtractionBatch` + `runExtractionBatch`

**Files:**
- Modify: `app/reviews/[reviewId]/extraction/actions.ts`

> Sem teste automatizado dedicado para Server Actions (padrão do projeto: a lógica testável vive nas libs já cobertas — enqueue/worker/run/queries; as actions são finas e orquestram). Verificação: `typecheck`/`lint` + o e2e manual do quickstart.

- [ ] **Step 1: Adicionar os imports necessários**

Em `app/reviews/[reviewId]/extraction/actions.ts`, adicione (vários já existem do bloco da Fatia 4 — inclua só os que faltam):

```ts
import { enqueueExtractionJob } from "@/lib/extraction/enqueue";
import { runExtractionBatchWorkerWith } from "@/lib/extraction/batch-run";
import {
  listExtractionBatchCandidates,
  listExtractionFields,
} from "@/lib/extraction/queries";
```

(`createAdminClient`, `getLLMProvider`, `MissingByokError`, `MockLLMProvider`, `requireMember`, `revalidate` já existem no arquivo da Fatia 4. Se `listExtractionFields` já estiver importado, não duplicar.)

- [ ] **Step 2: Implementar `estimateExtractionBatch` (FR-022 — antes de executar, sem efeito colateral)**

Acrescente ao fim de `app/reviews/[reviewId]/extraction/actions.ts`:

```ts
// ---- Extração em lote (Fatia 5 / US4) ----

/**
 * Estimativa de custo/tokens ANTES do lote (FR-022). NÃO cria job. Conta os
 * estudos elegíveis (interseção com os selecionados) × campos ativos e delega ao
 * contrato provider.estimateCost. Sem 1ª chave ⇒ usa Mock para a estimativa e
 * sinaliza byokMissing (não trava — slicing A1/§7-B).
 */
export async function estimateExtractionBatch(
  reviewId: string,
  recordIds: string[] | null,
) {
  const { supabase } = await requireMember(reviewId);

  const candidates = await listExtractionBatchCandidates({ supabase }, reviewId);
  const candidateIds = new Set(candidates.map((c) => c.id));
  const selected =
    recordIds && recordIds.length > 0
      ? recordIds.filter((id) => candidateIds.has(id))
      : candidates.map((c) => c.id);
  const itemCount = selected.length;

  const fields = await listExtractionFields({ supabase }, reviewId);
  const fieldCount = fields.length;

  let byokMissing = false;
  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) {
      provider = new MockLLMProvider();
      byokMissing = true;
    } else throw e;
  }

  const estimate = await provider.estimateCost({
    kind: "ai_extraction_batch",
    itemCount,
    fieldCount,
  });

  return { ok: true as const, itemCount, fieldCount, estimate, byokMissing };
}
```

- [ ] **Step 3: Implementar `runExtractionBatch` (enqueue + run server-side — A1)**

Acrescente em seguida:

```ts
/**
 * Enfileira o lote (create_extraction_job) e roda o worker server-side Node (A1).
 * Mesmo fallback de provider da extração single (Fatia 4): BYOK quando há chave,
 * senão Mock determinístico — não trava sem chave. Resiliente por-item / retomável
 * no worker (FR-021). Revalida para o JobsPanel refletir o consumo (FR-023).
 */
export async function runExtractionBatch(
  reviewId: string,
  recordIds: string[] | null,
) {
  await requireMember(reviewId);
  const admin = createAdminClient();

  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) provider = new MockLLMProvider();
    else throw e;
  }

  const enq = await enqueueExtractionJob({ supabase: admin }, reviewId, recordIds);
  if (enq.item_count === 0) {
    revalidate(reviewId);
    return { ok: true as const, jobId: enq.job_id, itemCount: 0 };
  }

  await runExtractionBatchWorkerWith(admin, provider, reviewId);
  revalidate(reviewId);
  return { ok: true as const, jobId: enq.job_id, itemCount: enq.item_count };
}
```

- [ ] **Step 4: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/reviews/[reviewId]/extraction/actions.ts
git commit -m "feat(002-f5): server actions estimateExtractionBatch + runExtractionBatch (US4/FR-021/FR-022)"
```

---

## Task 8: UI — `ExtractionBatchRunner` + integração na página

**Files:**
- Create: `src/components/extraction/ExtractionBatchRunner.tsx`
- Modify: `app/reviews/[reviewId]/extraction/page.tsx`

- [ ] **Step 1: Criar o componente client**

Crie `src/components/extraction/ExtractionBatchRunner.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StudyRow } from "@/lib/extraction/queries";
import type { CostEstimate } from "@/lib/ai/llm/types";

interface EstimateResult {
  ok: true;
  itemCount: number;
  fieldCount: number;
  estimate: CostEstimate;
  byokMissing: boolean;
}

export function ExtractionBatchRunner({
  reviewId,
  candidates,
  onEstimate,
  onRun,
}: {
  reviewId: string;
  candidates: StudyRow[];
  onEstimate: (
    reviewId: string,
    recordIds: string[] | null,
  ) => Promise<EstimateResult>;
  onRun: (
    reviewId: string,
    recordIds: string[] | null,
  ) => Promise<{ ok: boolean; jobId: string; itemCount: number }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.id)),
  );
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedIds = [...selected];
  const usd = estimate?.estimate.cost.usd;

  function toggle(id: string) {
    setEstimate(null); // estimativa expira quando a seleção muda (FR-022)
    setSummary(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doEstimate() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      try {
        const res = await onEstimate(reviewId, selectedIds);
        setEstimate(res);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function doRun() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await onRun(reviewId, selectedIds);
        setSummary(
          res.itemCount === 0
            ? "Nenhum estudo elegível no lote."
            : `Lote concluído: ${res.itemCount} estudo(s) processado(s).`,
        );
        setEstimate(null);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Nenhum estudo com PDF processado disponível para extração em lote.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-1.5">
            <input
              id={`batch-${c.id}`}
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
            />
            <label htmlFor={`batch-${c.id}`} className="text-sm">
              {c.title}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={doEstimate}
          disabled={pending || selectedIds.length === 0}
          className="btn-secondary"
        >
          Estimar custo ({selectedIds.length})
        </button>
        <button
          type="button"
          onClick={doRun}
          disabled={pending || !estimate || estimate.itemCount === 0}
          className="btn-primary"
        >
          Confirmar e extrair em lote
        </button>
      </div>

      {estimate && (
        <div className="panel space-y-1 p-3 text-sm">
          <div>
            Estimativa: <strong>{estimate.itemCount}</strong> estudo(s) ×{" "}
            <strong>{estimate.fieldCount}</strong> campo(s) ≈{" "}
            <strong>{estimate.estimate.tokensEstimated}</strong> tokens
            {usd != null && <> · ≈ US$ {usd.toFixed(4)}</>}
          </div>
          {estimate.byokMissing && (
            <p className="text-xs text-warn">
              Nenhuma chave de IA (BYOK) configurada — a extração roda em modo
              local de demonstração. Configure a chave para uso real; a extração
              manual segue disponível.
            </p>
          )}
        </div>
      )}

      {summary && <p className="text-sm text-ink-soft">{summary}</p>}
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}
```

> Classes `btn-primary`/`btn-secondary`/`panel`/`text-warn`/`text-ink-*`/`divide-line` são do design system existente (mesmas usadas em `ExtractionRunner`/`ExtractionFormBuilder`/`JobsPanel`). **Antes de implementar**, confirme que `btn-primary`/`btn-secondary` existem (`grep -rn "btn-primary\|btn-secondary" src/components app`); se não existirem, reaproveite as classes de botão já usadas no `ExtractionFormBuilder` — sem inventar estilo (FR-020/Princípio V).

- [ ] **Step 2: Integrar na página de Extração**

Em `app/reviews/[reviewId]/extraction/page.tsx`:

1. Acrescente `listExtractionBatchCandidates` ao import já existente de `@/lib/extraction/queries`.
2. Importe o componente e as duas novas actions:

```ts
import { ExtractionBatchRunner } from "@/components/extraction/ExtractionBatchRunner";
// no import de "./actions", acrescente:
//   estimateExtractionBatch,
//   runExtractionBatch,
```

3. Carregue os candidatos junto das demais queries (após `const studies = await listStudies({ supabase }, reviewId);`):

```ts
  const batchCandidates = await listExtractionBatchCandidates(
    { supabase },
    reviewId,
  );
```

4. Renderize o painel de lote como nova `<section>` **acima** da seção "Estudos para extração" (logo após o `<ExtractionFormBuilder … />`):

```tsx
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Extração em lote</h2>
        <p className="text-sm text-ink-soft">
          Rode a extração por IA sobre vários estudos de uma vez. A estimativa de
          custo aparece antes da execução.
        </p>
        <div className="panel p-4">
          <ExtractionBatchRunner
            reviewId={reviewId}
            candidates={batchCandidates}
            onEstimate={estimateExtractionBatch}
            onRun={runExtractionBatch}
          />
        </div>
      </section>
```

- [ ] **Step 3: Verificar tipos e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/extraction/ExtractionBatchRunner.tsx app/reviews/[reviewId]/extraction/page.tsx
git commit -m "feat(002-f5): ExtractionBatchRunner UI — seleção, estimativa, confirmação (US4/FR-021/FR-022)"
```

---

## Task 9: RLS — isolamento cross-review do lote (SC-011 análogo)

**Files:**
- Create: `tests/integration/rls.extraction-batch.test.ts`

- [ ] **Step 1: Escrever o teste de isolamento**

Crie `tests/integration/rls.extraction-batch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { enqueueExtractionJob } from "@/lib/extraction/enqueue";

describe("RLS — lote de extração escopado por Revisão (SC-011)", () => {
  it("não-membro não lê job/job_item/ai_usage de outra Revisão", async () => {
    const { client: a } = await signUpUser(
      `eba_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await a.rpc("create_review", { p_title: "Dona A" });
    const reviewId = review!.id as string;
    const svc = serviceClient();

    const { data: rec } = await svc
      .from("record")
      .insert({
        review_id: reviewId,
        corpus_state: "included_ft",
        source_format: "ris",
        raw: {},
        metadata: { title: "E" },
      })
      .select("id")
      .single();
    const { data: doc } = await svc
      .from("document")
      .insert({
        review_id: reviewId,
        record_id: rec!.id,
        storage_path: `review/${reviewId}/record/${rec!.id}/d.pdf`,
        filename: "d.pdf",
        byte_size: 10,
        processing_status: "text_ready",
      })
      .select("id")
      .single();
    await svc.from("text_layer").insert({
      review_id: reviewId,
      document_id: doc!.id,
      page: 1,
      char_start: 0,
      char_end: 10,
      content: "Texto.",
      origin: "nativo",
    });
    await a.rpc("ensure_extraction_form", { p_review_id: reviewId });
    await a.rpc("add_extraction_field", {
      p_review_id: reviewId,
      p_name: "Amostra",
      p_type: "number",
      p_options: null,
    });
    const enq = await enqueueExtractionJob({ supabase: a }, reviewId, null);
    await svc.from("ai_usage").insert({
      review_id: reviewId,
      phase: "extraction",
      tokens_in: 0,
      tokens_out: 0,
      cost: {},
      job_id: enq.job_id,
    });

    // Outro usuário (não-membro) não enxerga nada da Revisão de A.
    const { client: b } = await signUpUser(
      `ebb_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data: jobs } = await b
      .from("job")
      .select("id")
      .eq("review_id", reviewId);
    expect(jobs!.length).toBe(0);
    const { data: jis } = await b
      .from("job_item")
      .select("id")
      .eq("job_id", enq.job_id);
    expect(jis!.length).toBe(0);
    const { data: usage } = await b
      .from("ai_usage")
      .select("id")
      .eq("review_id", reviewId);
    expect(usage!.length).toBe(0);

    // E não consegue enfileirar lote na Revisão de A (RPC checa is_review_member).
    const { error: rpcErr } = await b.rpc("create_extraction_job", {
      p_review_id: reviewId,
      p_record_ids: null,
    });
    expect(rpcErr).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que passa**

Run: `npx vitest run tests/integration/rls.extraction-batch.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rls.extraction-batch.test.ts
git commit -m "test(002-f5): RLS isolamento cross-review do lote de extração (SC-011)"
```

---

## Task 10: Verificação final da fatia (CHECKPOINT 3)

**Files:** nenhum (gate de qualidade).

- [ ] **Step 1: Suíte completa de testes**

Run: `npm run test`
Expected: todos verdes — inclusive Marco 1 e Fatias 1–4 (não-regressão).

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: sem erros (`tsc --noEmit`).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 4: Conferir o estado do branch e o diff**

Run: `git diff --stat 002-marco2-coracao-ai-first...HEAD`
Expected: commits da Fatia 5 (Tasks 1–9) presentes; o diff toca apenas os arquivos listados em **File Structure**.

- [ ] **Step 5: PARAR (CHECKPOINT 3)**

**Não** fazer merge/push. Apresentar ao desenvolvedor: branch da fatia, diff, e a saída de `npm run test` + `npm run lint` + `npm run typecheck`. Aguardar o **merge manual**. Só então atualizar o tracking (`slicing.md` + `COMPLETION-fatia-5.md`) e seguir para a Fatia 6.

---

## Self-Review (cobertura do spec — US4)

| Requisito | Coberto por |
|---|---|
| **FR-021** lote como job assíncrono, progresso, retomável, resiliente por-item | Task 1 (RPC enqueue), Task 3 (`processExtractionJob`: pending-only=retomável, try/catch por item=resiliente, `progress`), Task 4 (run wrapper), Task 8 (UI dispara) |
| **FR-022** estimativa de custo/tokens + confirmação antes do lote | Task 7 (`estimateExtractionBatch` via `provider.estimateCost`), Task 8 (estimativa exibida; botão de extrair só habilita após estimativa; estimativa expira ao mudar seleção) |
| **FR-023** consumo acumulado por Revisão e por fase | Task 3 (`ai_usage(phase='extraction', job_id)` por item), Task 6 (`summarizeUsageByPhase` + JobsPanel por fase) |
| **SC-006** estimativa antes de todo lote + consumo por Revisão/fase | Task 7 + Task 8 (estimativa obrigatória antes de rodar) + Task 6 (consumo por fase) |
| **SC-011** isolamento cross-review | Task 9 (RLS job/job_item/ai_usage + RPC `is_review_member`) |
| **Sem 1ª chave ⇒ não trava** | Task 7 (fallback Mock + `byokMissing`), Task 8 (aviso, fluxo segue) |
| **FR-029 (audit, transversal)** | Task 1 (RPC escreve `audit_entry` `enqueue_extraction_batch`) |
| **A1 (worker server-side Node)** | Task 3/4/7 (worker Node, provider injetado; Edge/`pg_cron` intocada) |

**Consistência de tipos:** `enqueueExtractionJob`→`ExtractionEnqueueResult{job_id,status,item_count}`; `processExtractionJob`/`runExtractionBatchWorkerWith` compartilham `ExtractionBatchDeps{supabase,provider}`; `estimateExtractionBatch` retorna o shape consumido por `EstimateResult` do componente (`itemCount`,`fieldCount`,`estimate:CostEstimate`,`byokMissing`); `summarizeUsageByPhase`→`PhaseUsage[]` consumido por `JobsPanel`/`JobsAndUsage.usageByPhase`. `provider.estimateCost({kind:'ai_extraction_batch',itemCount,fieldCount})` e `CostEstimate{tokensEstimated,cost}` já existem (contrato da Fatia 4).

**Não-regressão:** enum aditivo (Task 1); `usage.ts` estende sem alterar `summarizeUsage`/`getJobsAndUsage` assinaturas-base (campo novo + função nova); `actions.ts`/`page.tsx`/`JobsPanel.tsx` recebem adições; nenhuma alteração em screening/import/workbench/Fatias 1–4. **Nenhuma dependência nova** (Voyage/pgvector ficam na Fatia 6).

## Execution Handoff

Plano salvo em `specs/002-marco2-coracao-ai-first/IMPLEMENTATION_PLAN.md`.

Regime desta sessão (CLAUDE.md §5): após aprovação do plano (CHECKPOINT 2) → `using-git-worktrees` (worktree da fatia a partir do **HEAD da feature**, não de `origin/main` — ver memória de setup) → `subagent-driven-development` (um subagente por task, TDD, commit no branch isolado `build/002-marco2-coracao-ai-first/5-extracao-lote`) → **PARAR** no CHECKPOINT 3 → aguardar merge manual.
