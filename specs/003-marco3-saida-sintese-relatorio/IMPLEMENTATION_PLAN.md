# Fatia 3 — Relatório estruturado (US3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Contrato Sessão B**: commitar **somente** no branch isolado `build/003-marco3-saida-sintese-relatorio/3-report`; **nunca** merge/push para a feature ou `main`. Ao fim, **PARAR** (CHECKPOINT 3) e aguardar merge do usuário.

**Goal:** Gerar um relatório estruturado da Revisão — Métodos/Resultados/Declaração-IA/Desvios **determinísticos** (sem novo passe de LLM), Resultados **embutindo a síntese ratificada de US1**, e Discussão/Conclusão **rascunhadas por IA** como ponto de partida editável — com edição por seção, regeneração que **preserva** seções editadas pelo humano, e tudo auditado e em pt-BR.

**Architecture:** Espelha os pipelines dos Marcos 1–2 e da Fatia 2 (Síntese): migration+RLS+RPC primeiro (Princípio IV); seções factuais montadas por **funções puras** sobre dados carregados (split `sections.ts` puro + `queries.ts` IO, como `prisma/flow-model.ts`+`queries.ts`), **sem LLM** (§I/§II); Discussão/Conclusão só via `LLMProvider.draftReportSection` (§VII) num **worker Node** (Edge só enfileira, §VIII), resiliente por-seção. Edição move a seção a `human_edited` (RPC auditada, espelha `set_theme_state`); regeneração reescreve `deterministic`+`ai_generated` e **preserva** `human_edited`, avisando quais manteve (FR-016/§III). Resultados é **deterministic-only** (A3 — fonte única é a Síntese; sem override por seção).

**Tech Stack:** Next.js 14 (App Router, Server Components + server actions), TypeScript strict, Supabase (Postgres + RLS + RPC `security definer`), Vitest (unit/integration), `LLMProvider` (Anthropic default, Mock para teste/sem-chave). **Sem libs novas** (exportação DOCX/PDF é Fatia 5/6).

**Branch:** `build/003-marco3-saida-sintese-relatorio/3-report` (criar de feature HEAD via `using-git-worktrees`).

**Cobre:** US3 — FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-024; SC-003, SC-004, SC-009 (declaração no relatório). **A\*:** A3 (Resultados deterministic-only; fonte única = Síntese — Task 3/Task 6).

**Depende de (já mergeado na feature):** Fatia 1 (fluxograma PRISMA — `loadPrismaFlowModel`/`PrismaFlowchart` reusados no UI) e Fatia 2 (síntese — `loadSynthesis` para embutir em Resultados).

---

## Fronteiras de escopo (ler antes de começar)

- **NÃO** incluir a **tabela de características** dos estudos nesta fatia — `buildCharacteristicsTable` e o checklist PRISMA são **Fatia 4** (gate de cobertura sem overlap). Aqui Resultados = contagens (views PRISMA) **+** narrativa de síntese ratificada. A Fatia 4 estende Resultados/`report/page.tsx`.
- **NÃO** implementar exportação (MD/DOCX/PDF/BibTeX/RIS) — Fatias 5/6.
- **NÃO** refatorar Marcos 1–2 nem a Fatia 2. Só **estender**: `shell/phases.ts`, `ai/llm/*`, `ai/llm/cost.ts`, e novos diretórios `lib/report/`, `components/report/`, `app/reviews/[reviewId]/report/`.
- **Resultados, declaração-IA e desvios são deterministic** e **não editáveis** (sem `human_edited`): regeneração sempre os reescreve do estado atual. **Editáveis → `human_edited`:** apenas **Métodos, Discussão, Conclusão** (A3 carva Resultados; declaração-IA/desvios são factuais).

## Regras de proveniência e estado (invariantes — verificar em cada task)

- Toda seção de IA (Discussão/Conclusão) nasce `edit_state='ai_generated'`, com `ai_suggestion_id` apontando para uma `ai_suggestion(target_kind='report_section', state='pending')` com `provenance` completa (`model/version/prompt_or_span/timestamp`) — §II/FR-031.
- `ai_usage` registrado com `phase='report'` por seção de IA efetivamente rascunhada (FR-026; `ai_usage.phase` é **text**, sem ALTER).
- Geração e edições registram `audit_entry` (FR-017).
- Conteúdo em **pt-BR** (D24).
- RLS: `report`/`report_section` só acessíveis a `is_review_member`.

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `supabase/migrations/0019_report.sql` | **[novo]** enums `report_section_kind`/`report_section_edit_state`; tabelas `report`/`report_section`; `ALTER TYPE ai_target_kind ADD 'report_section'`; `ALTER TYPE job_type ADD 'report_draft'`; RLS; RPCs `create_report_draft_job`, `set_report_section_content` |
| `src/lib/ai/llm/types.ts` | **[estende]** `ThemeSummary`, `DraftedSection`; `draftReportSection`; union `estimateCost` + `report_draft` |
| `src/lib/ai/llm/cost.ts` | **[estende]** `estimateReportDraftCost` |
| `src/lib/ai/llm/mock.ts` | **[estende]** `draftReportSection` + ramo `report_draft` no `estimateCost` |
| `src/lib/ai/llm/anthropic.ts` | **[estende]** `draftReportSection` + ramo `report_draft` no `estimateCost` |
| `src/lib/report/types.ts` | **[novo]** `ReportInputs`, `SectionKind`, `EditState`, `BuiltSection` |
| `src/lib/report/sections.ts` | **[novo]** builders **puros**: `buildMethodsSection`, `buildResultsSection`, `buildAiDeclaration`, `buildDeviations`, `buildOptionalPhasesDeclaration`, `buildDeterministicSections` |
| `src/lib/report/queries.ts` | **[novo]** IO `loadReportInputs(deps)`, `loadReport(deps)` (deps-injection p/ testes), `resolveReport(deps)` |
| `src/lib/report/enqueue.ts` | **[novo]** `enqueueReportDraftJob` (RPC `create_report_draft_job`) |
| `src/lib/report/batch-worker.ts` | **[novo]** `processReportDraftJob` (determinístico + drafts IA, resiliente por-seção) |
| `src/lib/report/batch-run.ts` | **[novo]** `runReportDraftWorkerWith` |
| `src/lib/report/regenerate.ts` | **[novo]** `regenerateDeterministicSections` (puro+IO split) — preserva `human_edited` |
| `app/reviews/[reviewId]/report/actions.ts` | **[novo]** server actions `estimateReport`, `generateReport`, `regenerateReport`, `editReportSection` |
| `app/reviews/[reviewId]/report/page.tsx` | **[novo]** Server Component: monta seções, embute `PrismaFlowchart`, runner/editor |
| `src/components/report/*` | **[novo]** `ReportRunner`, `SectionView`, `SectionEditor`, `AiDeclarationPanel`, `RegenerateButton` |
| `src/lib/shell/phases.ts` | **[estende]** `PhaseKey 'report'`, entrada no `PIPELINE`, `reportReady` em `PhaseInput`/`loadPhaseStates` |
| `tests/unit/report-sections.test.ts` | **[novo]** builders puros |
| `tests/unit/llm-contract.test.ts` | **[estende]** `draftReportSection` |
| `tests/integration/report.test.ts` | **[novo]** RLS, RPC, worker, regeneração preserva `human_edited` |
| `tests/unit/phases.test.ts` | **[estende]** fase `report` |

---

## Task 1: Migration — `report`, `report_section`, enums, RLS, RPCs

**Files:**
- Create: `supabase/migrations/0019_report.sql`
- Test: `tests/integration/report.test.ts`

- [ ] **Step 1: Write the failing integration test** (`tests/integration/report.test.ts`)

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpUser, serviceClient } from "./helpers/supabase";
// (imports das libs de report são adicionados ao topo nas Tasks 4/5/6)

// Harness (espelha tests/integration/synthesis.test.ts):
//  - serviceClient() bypassa RLS → semeia/lê livremente; é TAMBÉM o client do worker Node.
//  - signUpUser() → client anônimo já logado; create_review RPC auto-insere a row member.
//  - RPCs gated em membership (create_report_draft_job, set_report_section_content) ⇒ client `member`.
async function seedReview(
  label: string,
): Promise<{ svc: SupabaseClient; member: SupabaseClient; reviewId: string }> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const svc = serviceClient();
  const { client: member } = await signUpUser(
    `report_${label}_${stamp}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await member.rpc("create_review", {
    p_title: `Relatório ${label} ${stamp}`,
  });
  if (error) throw new Error(error.message);
  return { svc, member, reviewId: (review as { id: string }).id };
}

describe("Fatia 3 — migration report (0019)", () => {
  it("create_report_draft_job enfileira job report_draft com 2 job_items (seções IA)", async () => {
    const { svc, member, reviewId } = await seedReview("mig");
    const { data: job, error } = await member.rpc("create_report_draft_job", {
      p_review_id: reviewId,
    });
    expect(error).toBeNull();
    const jobId = (job as { id: string }).id;
    const { count } = await svc
      .from("job_item")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);
    expect(count).toBe(2); // discussion + conclusion
    const { data: jr } = await svc.from("job").select("type").eq("id", jobId).single();
    expect((jr as { type: string }).type).toBe("report_draft");
  });

  it("set_report_section_content move Discussão para human_edited e audita", async () => {
    const { svc, member, reviewId } = await seedReview("edit");
    const { data: rep } = await svc
      .from("report")
      .insert({ review_id: reviewId, status: "ready" })
      .select("id")
      .single();
    const { data: sec } = await svc
      .from("report_section")
      .insert({
        review_id: reviewId,
        report_id: (rep as { id: string }).id,
        kind: "discussion",
        content: "rascunho",
        edit_state: "ai_generated",
        order: 2,
      })
      .select("id")
      .single();
    const sectionId = (sec as { id: string }).id;

    const { error } = await member.rpc("set_report_section_content", {
      p_section_id: sectionId,
      p_content: "texto editado pelo humano",
    });
    expect(error).toBeNull();
    const { data: after } = await svc
      .from("report_section")
      .select("content, edit_state")
      .eq("id", sectionId)
      .single();
    expect((after as { edit_state: string }).edit_state).toBe("human_edited");
    expect((after as { content: string }).content).toBe("texto editado pelo humano");

    const { count: auditCount } = await svc
      .from("audit_entry")
      .select("id", { count: "exact", head: true })
      .eq("entity", "report_section")
      .eq("entity_id", sectionId);
    expect((auditCount ?? 0) >= 1).toBe(true);
  });

  it("set_report_section_content rejeita edição de Resultados (deterministic-only, A3)", async () => {
    const { svc, member, reviewId } = await seedReview("a3");
    const { data: rep } = await svc
      .from("report")
      .insert({ review_id: reviewId, status: "ready" })
      .select("id")
      .single();
    const { data: sec } = await svc
      .from("report_section")
      .insert({
        review_id: reviewId,
        report_id: (rep as { id: string }).id,
        kind: "results",
        content: "c",
        edit_state: "deterministic",
        order: 1,
      })
      .select("id")
      .single();
    const { error } = await member.rpc("set_report_section_content", {
      p_section_id: (sec as { id: string }).id,
      p_content: "x",
    });
    expect(error).not.toBeNull(); // A3: Resultados não tem override por seção
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/integration/report.test.ts`
Expected: FAIL — `create_report_draft_job`/`set_report_section_content` não existem.

- [ ] **Step 3: Write the migration** (`supabase/migrations/0019_report.sql`)

```sql
-- ============================================================
-- Marco 3 / Fatia 3 — Relatório estruturado (US3 / FR-012..017).
-- Aditivo (não-regressão Marco ≥ 2): tabelas novas + 2 enum ADD VALUE + RPCs.
-- Determinístico por padrão; Discussão/Conclusão via worker Node (report_draft).
-- A RPC create_report_draft_job só ENFILEIRA (§VIII); o worker Node monta/rascunha.
-- ============================================================

alter type ai_target_kind add value if not exists 'report_section';
alter type job_type        add value if not exists 'report_draft';

create type report_section_kind as enum (
  'methods', 'results', 'discussion', 'conclusion', 'ai_declaration', 'deviations'
);
create type report_section_edit_state as enum (
  'deterministic', 'ai_generated', 'human_edited'
);

create table public.report (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.review(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft','generating','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_section (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.review(id) on delete cascade,
  report_id uuid not null references public.report(id) on delete cascade,
  kind report_section_kind not null,
  content text not null default '',
  edit_state report_section_edit_state not null default 'deterministic',
  ai_suggestion_id uuid references public.ai_suggestion(id) on delete set null,
  "order" int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, kind)
);
create index report_section_report_idx on public.report_section(report_id, "order");

alter table public.report enable row level security;
alter table public.report_section enable row level security;

create policy report_member on public.report
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));
create policy report_section_member on public.report_section
  for all using (public.is_review_member(review_id))
  with check (public.is_review_member(review_id));

-- create_report_draft_job: só enfileira. Item = uma seção IA (discussion|conclusion).
create or replace function public.create_report_draft_job(p_review_id uuid)
returns public.job
language plpgsql security definer set search_path = public as $$
declare v_job public.job;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  insert into public.job (review_id, type, status)
  values (p_review_id, 'report_draft', 'queued')
  returning * into v_job;

  insert into public.job_item (job_id, review_id, status, payload)
  values
    (v_job.id, p_review_id, 'pending', jsonb_build_object('kind', 'discussion')),
    (v_job.id, p_review_id, 'pending', jsonb_build_object('kind', 'conclusion'));

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'user', auth.uid(), 'create', 'job', v_job.id,
    null, jsonb_build_object('type', 'report_draft', 'item_count', 2)
  );
  return v_job;
end; $$;
grant execute on function public.create_report_draft_job(uuid) to authenticated;

-- set_report_section_content: edição humana auditada. Resultados/declaração-IA/desvios
-- são deterministic-only (A3 p/ Resultados; factuais p/ os outros) ⇒ rejeitados.
create or replace function public.set_report_section_content(
  p_section_id uuid, p_content text
) returns public.report_section
language plpgsql security definer set search_path = public as $$
declare v_before public.report_section; v_after public.report_section;
begin
  select * into v_before from public.report_section where id = p_section_id;
  if v_before.id is null then raise exception 'section not found'; end if;
  if not public.is_review_member(v_before.review_id) then
    raise exception 'not a member';
  end if;
  if v_before.kind in ('results','ai_declaration','deviations') then
    raise exception 'section is deterministic and not editable';
  end if;

  update public.report_section set
    content = p_content,
    edit_state = 'human_edited',
    updated_at = now()
  where id = p_section_id returning * into v_after;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    v_before.review_id, 'user', auth.uid(), 'update', 'report_section', p_section_id,
    jsonb_build_object('content', v_before.content, 'edit_state', v_before.edit_state),
    jsonb_build_object('content', v_after.content, 'edit_state', v_after.edit_state)
  );
  return v_after;
end; $$;
grant execute on function public.set_report_section_content(uuid, text) to authenticated;
```

- [ ] **Step 4: Apply the migration to local DB**

Run: `npx supabase db reset` (recarrega todas as migrations no banco local)
Expected: aplica até `0019_report.sql` sem erro.

- [ ] **Step 5: Run the integration test to verify it passes**

Run: `npx vitest run tests/integration/report.test.ts`
Expected: PASS (3 testes verdes).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0019_report.sql tests/integration/report.test.ts
git commit -m "feat(report): migration report/report_section + RPCs (US3 schema)"
```

---

## Task 2: `LLMProvider.draftReportSection` + `estimateCost(report_draft)`

**Files:**
- Modify: `src/lib/ai/llm/types.ts`
- Modify: `src/lib/ai/llm/cost.ts`
- Modify: `src/lib/ai/llm/mock.ts`
- Modify: `src/lib/ai/llm/anthropic.ts`
- Test: `tests/unit/llm-contract.test.ts`

- [ ] **Step 1: Add the failing contract test** (append to `tests/unit/llm-contract.test.ts`)

```ts
describe("draftReportSection (contrato §VII)", () => {
  const provider = new MockLLMProvider();

  it("rascunha Discussão com provenance completa e pt-BR", async () => {
    const r = await provider.draftReportSection({
      kind: "discussion",
      context: {
        methods: "## Métodos\n...",
        results: "## Resultados\n...",
        themes: [{ name: "Tema A", narrative: "Narrativa do tema A" }],
      },
      language: "pt-BR",
    });
    expect(r.content.length).toBeGreaterThan(0);
    expect(r.provenance.model).toBeTruthy();
    expect(r.provenance.version).toBeTruthy();
    expect(r.provenance.prompt_or_span).toBeTruthy();
    expect(r.provenance.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("estimateCost aceita report_draft", async () => {
    const e = await provider.estimateCost({ kind: "report_draft", itemCount: 2 });
    expect(e.tokensEstimated).toBeGreaterThan(0);
    expect(typeof e.cost).toBe("object");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/unit/llm-contract.test.ts`
Expected: FAIL — `draftReportSection` não existe; `report_draft` não está na union de `estimateCost`.

- [ ] **Step 3: Extend the types** (`src/lib/ai/llm/types.ts`)

Adicione perto de `SynthesizedTheme`:

```ts
export interface ThemeSummary {
  name: string;
  narrative: string; // pt-BR
}

export interface DraftedSection {
  content: string; // markdown, pt-BR
  provenance: Provenance;
}
```

No `interface LLMProvider`, adicione o método (após `synthesizeThemes`):

```ts
  /** Rascunha Discussão/Conclusão como ponto de partida editável (D29). pt-BR.
   *  Texto livre (não é sugestão factual com source_span): provenance OBRIGATÓRIA. */
  draftReportSection(input: {
    kind: "discussion" | "conclusion";
    context: { methods: string; results: string; themes: ThemeSummary[] };
    language: "pt-BR";
  }): Promise<DraftedSection>;
```

E estenda a union de `estimateCost` com:

```ts
      | { itemCount: number; kind: "report_draft" }
```

(o parâmetro `estimateCost` passa a aceitar `ai_screening_batch | ai_extraction_batch | synthesis_batch | report_draft`.)

- [ ] **Step 4: Add the cost helper** (`src/lib/ai/llm/cost.ts`)

```ts
/** Estimativa p/ rascunho de seções de relatório (Discussão/Conclusão). */
export function estimateReportDraftCost(sectionCount: number): CostEstimate {
  const tokensEstimated = sectionCount * 1200; // ~1.2k tokens por seção
  return { tokensEstimated, cost: { usd: (tokensEstimated / 1000) * 0.0025 } };
}
```

(Importe `CostEstimate` se ainda não estiver importado no arquivo.)

- [ ] **Step 5: Implement in the Mock** (`src/lib/ai/llm/mock.ts`)

Importe `DraftedSection`, `ThemeSummary` e `estimateReportDraftCost`. No `estimateCost`, antes do `return` final, adicione:

```ts
    if (input.kind === "report_draft") {
      return estimateReportDraftCost(input.itemCount);
    }
```

Adicione o método (determinístico, pt-BR):

```ts
  async draftReportSection(input: {
    kind: "discussion" | "conclusion";
    context: { methods: string; results: string; themes: ThemeSummary[] };
    language: "pt-BR";
  }): Promise<DraftedSection> {
    const titulo = input.kind === "discussion" ? "Discussão" : "Conclusão";
    const temas = input.context.themes.map((t) => `- ${t.name}`).join("\n");
    const content =
      `## ${titulo}\n\n` +
      `Rascunho simulado de ${titulo.toLowerCase()} a partir dos temas ratificados:\n` +
      (temas || "- (sem temas)") +
      `\n`;
    return { content, provenance: provenance(`draftReportSection:${input.kind}`) };
  }
```

- [ ] **Step 6: Implement in Anthropic** (`src/lib/ai/llm/anthropic.ts`)

Importe `DraftedSection`, `ThemeSummary`, `estimateReportDraftCost`. No `estimateCost`, adicione o ramo:

```ts
    if (input.kind === "report_draft") {
      return estimateReportDraftCost(input.itemCount);
    }
```

Adicione o método (usa o helper `ask` privado existente):

```ts
  async draftReportSection(input: {
    kind: "discussion" | "conclusion";
    context: { methods: string; results: string; themes: ThemeSummary[] };
    language: "pt-BR";
  }): Promise<DraftedSection> {
    const titulo = input.kind === "discussion" ? "Discussão" : "Conclusão";
    const temas = input.context.themes
      .map((t) => `### ${t.name}\n${t.narrative}`)
      .join("\n\n");
    const system =
      `Você redige a seção "${titulo}" de uma revisão sistemática qualitativa. ` +
      `Baseie-se ESTRITAMENTE nos Métodos, Resultados e temas fornecidos; ` +
      `não introduza achados novos. Texto corrido, acadêmico, pt-BR.`;
    const user =
      `# Métodos\n${input.context.methods}\n\n# Resultados\n${input.context.results}\n\n` +
      `# Temas ratificados\n${temas || "(nenhum)"}\n\n` +
      `Escreva a seção ${titulo} em markdown, iniciando por "## ${titulo}".`;
    const text = await this.ask(system, user);
    return {
      content: text,
      provenance: {
        model: MODEL,
        version: MODEL,
        prompt_or_span: `draftReportSection:${input.kind}`,
        timestamp: nowIso(),
      },
    };
  }
```

- [ ] **Step 7: Run the contract test**

Run: `npx vitest run tests/unit/llm-contract.test.ts`
Expected: PASS (incl. os 2 novos casos).

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai/llm/types.ts src/lib/ai/llm/cost.ts src/lib/ai/llm/mock.ts src/lib/ai/llm/anthropic.ts tests/unit/llm-contract.test.ts
git commit -m "feat(report): LLMProvider.draftReportSection + estimateCost report_draft"
```

---

## Task 3: Builders determinísticos puros (`src/lib/report/sections.ts`)

**Files:**
- Create: `src/lib/report/types.ts`
- Create: `src/lib/report/sections.ts`
- Test: `tests/unit/report-sections.test.ts`

Princípio: **funções puras** sobre `ReportInputs` (sem IO) — testáveis sem DB, espelhando `prisma/flow-model.ts`'s `toFlowModel`. A camada IO (Task 4) carrega os `ReportInputs`.

- [ ] **Step 1: Define the input types** (`src/lib/report/types.ts`)

```ts
import type { PrismaCounters, ExclusionCount } from "@/lib/prisma/queries";

export type SectionKind =
  | "methods"
  | "results"
  | "discussion"
  | "conclusion"
  | "ai_declaration"
  | "deviations";

export type EditState = "deterministic" | "ai_generated" | "human_edited";

/** Insumos factuais p/ as seções determinísticas (carregados pela camada IO). */
export interface ReportInputs {
  question: {
    framework: string;
    questionText: string;
    fields: Record<string, string>;
  } | null;
  criteria: { kind: "inclusion" | "exclusion" | "search_term"; text: string }[];
  protocol: { state: "draft" | "locked"; lockedAt: string | null } | null;
  searchQuery: string; // string de busca composta (getSuggestedQuery)
  searches: { database: string; recordCount: number }[];
  counters: PrismaCounters;
  exclusions: ExclusionCount[];
  amendments: { version: number; datedAt: string; change: Record<string, unknown> }[];
  themes: { name: string; narrative: string }[]; // síntese RATIFICADA (US1)
  aiSuggestions: { targetKind: string; model: string; version: string; state: string }[];
  optionalPhasesOff: { key: string; label: string }[];
}

export interface BuiltSection {
  kind: SectionKind;
  content: string; // markdown pt-BR
  order: number;
}
```

- [ ] **Step 2: Write the failing unit tests** (`tests/unit/report-sections.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import {
  buildMethodsSection,
  buildResultsSection,
  buildAiDeclaration,
  buildDeviations,
  buildOptionalPhasesDeclaration,
  buildDeterministicSections,
} from "@/lib/report/sections";
import type { ReportInputs } from "@/lib/report/types";

const base: ReportInputs = {
  question: { framework: "spider", questionText: "Qual o impacto de X?", fields: { S: "amostra" } },
  criteria: [
    { kind: "inclusion", text: "Estudos qualitativos" },
    { kind: "exclusion", text: "Editoriais" },
    { kind: "search_term", text: "X AND Y" },
  ],
  protocol: { state: "locked", lockedAt: "2026-01-10T00:00:00Z" },
  searchQuery: "X AND Y",
  searches: [{ database: "PubMed", recordCount: 120 }],
  counters: {
    identified: 120, duplicates: 20, screened: 100, includedTs: 0, excludedTs: 60,
    maybeTs: 0, passedTs: 40, includedFt: 12, excludedFt: 28,
  },
  exclusions: [{ reasonId: "r1", reasonLabel: "Fora do escopo", n: 28 }],
  amendments: [{ version: 1, datedAt: "2026-02-01", change: { campo: "critério" } }],
  themes: [{ name: "Adesão", narrative: "Os estudos convergem em adesão." }],
  aiSuggestions: [
    { targetKind: "screening", model: "claude-opus-4-8", version: "v1", state: "accepted" },
    { targetKind: "synthesis_theme", model: "claude-opus-4-8", version: "v1", state: "accepted" },
  ],
  optionalPhasesOff: [
    { key: "risk_of_bias", label: "Risco de Viés" },
    { key: "certainty", label: "Certeza (CERQual)" },
  ],
};

describe("buildMethodsSection (FR-012, determinístico)", () => {
  it("inclui pergunta, critérios, protocolo travado, busca e fluxo de triagem", () => {
    const md = buildMethodsSection(base);
    expect(md).toContain("Qual o impacto de X?");
    expect(md).toContain("Estudos qualitativos");
    expect(md).toContain("PubMed");
    expect(md).toContain("X AND Y");
    expect(md).toMatch(/120/); // identificados
    expect(md).toContain("Risco de Viés"); // declara fases opcionais OFF (FR-015)
  });
});

describe("buildResultsSection (A3 — embute síntese, sem LLM)", () => {
  it("embute as contagens e a narrativa de síntese ratificada", () => {
    const md = buildResultsSection(base);
    expect(md).toContain("12"); // incluídos texto completo
    expect(md).toContain("Adesão");
    expect(md).toContain("Os estudos convergem em adesão.");
  });
  it("sinaliza síntese ausente sem inventar", () => {
    const md = buildResultsSection({ ...base, themes: [] });
    expect(md.toLowerCase()).toContain("síntese");
  });
});

describe("buildAiDeclaration (FR-013/SC-003)", () => {
  it("enumera 100% das fases com sugestão de IA, com proveniência", () => {
    const md = buildAiDeclaration(base);
    expect(md).toContain("Triagem");
    expect(md).toContain("Síntese");
    expect(md).toContain("claude-opus-4-8");
  });
  it("declara ausência de IA quando não houve sugestões", () => {
    const md = buildAiDeclaration({ ...base, aiSuggestions: [] });
    expect(md.length).toBeGreaterThan(0);
  });
});

describe("buildDeviations (FR-014/SC-004)", () => {
  it("lista emendas datadas pós-travamento", () => {
    const md = buildDeviations(base);
    expect(md).toContain("2026-02-01");
    expect(md).toContain("1"); // versão
  });
  it("declara ausência de desvios quando não há emendas", () => {
    const md = buildDeviations({ ...base, amendments: [] });
    expect(md.length).toBeGreaterThan(0);
  });
});

describe("buildOptionalPhasesDeclaration (FR-015/SC-009)", () => {
  it("declara explicitamente as fases opcionais desligadas", () => {
    const md = buildOptionalPhasesDeclaration(base);
    expect(md).toContain("Risco de Viés");
    expect(md).toContain("Certeza");
  });
});

describe("buildDeterministicSections", () => {
  it("retorna methods/results/ai_declaration/deviations em ordem", () => {
    const secs = buildDeterministicSections(base);
    expect(secs.map((s) => s.kind)).toEqual([
      "methods", "results", "ai_declaration", "deviations",
    ]);
    expect(secs.every((s) => s.content.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/report-sections.test.ts`
Expected: FAIL — módulo `sections.ts` não existe.

- [ ] **Step 4: Implement the pure builders** (`src/lib/report/sections.ts`)

```ts
import type { ReportInputs, BuiltSection } from "./types";

const TARGET_PHASE_LABEL: Record<string, string> = {
  eligibility: "Pergunta e critérios de elegibilidade",
  protocol_draft: "Protocolo",
  screening: "Triagem (título/resumo e texto completo)",
  extraction: "Extração de dados",
  synthesis_theme: "Síntese qualitativa",
  report_section: "Redação do relatório",
};

/** Métodos — factual, sem LLM (FR-012). Anexa a declaração de fases opcionais (FR-015). */
export function buildMethodsSection(i: ReportInputs): string {
  const lines: string[] = ["## Métodos", ""];

  if (i.question) {
    lines.push(`**Pergunta de pesquisa** (${i.question.framework.toUpperCase()}): ${i.question.questionText}`, "");
    const fieldKeys = Object.keys(i.question.fields);
    if (fieldKeys.length > 0) {
      lines.push("Componentes do enquadramento:");
      for (const k of fieldKeys) lines.push(`- **${k}**: ${i.question.fields[k]}`);
      lines.push("");
    }
  }

  const incl = i.criteria.filter((c) => c.kind === "inclusion");
  const excl = i.criteria.filter((c) => c.kind === "exclusion");
  lines.push("### Critérios de elegibilidade", "");
  lines.push("**Inclusão:**");
  lines.push(...(incl.length ? incl.map((c) => `- ${c.text}`) : ["- (não especificados)"]));
  lines.push("", "**Exclusão:**");
  lines.push(...(excl.length ? excl.map((c) => `- ${c.text}`) : ["- (não especificados)"]));
  lines.push("");

  lines.push("### Protocolo", "");
  if (i.protocol?.state === "locked") {
    const dt = i.protocol.lockedAt ? formatDate(i.protocol.lockedAt) : "data não registrada";
    lines.push(`Protocolo travado em ${dt}.`, "");
  } else {
    lines.push("Protocolo ainda não travado.", "");
  }

  lines.push("### Fontes e estratégia de busca", "");
  if (i.searches.length) {
    for (const s of i.searches) lines.push(`- ${s.database}: ${s.recordCount} registro(s)`);
  } else {
    lines.push("- (nenhuma busca registrada)");
  }
  if (i.searchQuery) lines.push("", `String de busca: \`${i.searchQuery}\``);
  lines.push("");

  lines.push("### Fluxo de triagem", "");
  const c = i.counters;
  lines.push(
    `Identificados: ${c.identified}; duplicados removidos: ${c.duplicates}; ` +
      `triados: ${c.screened}; avaliados em texto completo: ${c.passedTs}; ` +
      `incluídos: ${c.includedFt}; excluídos em texto completo: ${c.excludedFt}.`,
    "",
  );

  lines.push(buildOptionalPhasesDeclaration(i));
  return lines.join("\n").trimEnd();
}

/** Resultados — A3: contagens + EMBUTE a narrativa de síntese ratificada (sem novo LLM). */
export function buildResultsSection(i: ReportInputs): string {
  const c = i.counters;
  const lines: string[] = ["## Resultados", ""];
  lines.push(
    `Foram incluídos ${c.includedFt} estudo(s) em texto completo, ` +
      `de ${c.identified} registro(s) identificados.`,
    "",
  );
  if (i.exclusions.length) {
    lines.push("Exclusões em texto completo por motivo:");
    for (const e of i.exclusions) lines.push(`- ${e.reasonLabel}: ${e.n}`);
    lines.push("");
  }
  lines.push("### Síntese qualitativa", "");
  if (i.themes.length === 0) {
    lines.push(
      "_Síntese qualitativa ainda não ratificada — gere e ratifique a síntese na fase Síntese para compor esta seção._",
    );
  } else {
    for (const t of i.themes) {
      lines.push(`#### ${t.name}`, "", t.narrative, "");
    }
  }
  return lines.join("\n").trimEnd();
}

/** Declaração de uso de IA — factual, das ai_suggestion usadas (FR-013/SC-003). Sem LLM. */
export function buildAiDeclaration(i: ReportInputs): string {
  const lines: string[] = ["## Declaração de uso de Inteligência Artificial", ""];
  if (i.aiSuggestions.length === 0) {
    lines.push("Nenhuma etapa desta revisão utilizou assistência de IA.");
    return lines.join("\n");
  }
  // Agrupa por fase (target_kind), preservando proveniência (modelo/versão).
  const byPhase = new Map<string, { models: Set<string>; count: number }>();
  for (const s of i.aiSuggestions) {
    const label = TARGET_PHASE_LABEL[s.targetKind] ?? s.targetKind;
    const e = byPhase.get(label) ?? { models: new Set<string>(), count: 0 };
    e.models.add(`${s.model} (${s.version})`);
    e.count += 1;
    byPhase.set(label, e);
  }
  lines.push("As seguintes etapas foram assistidas por IA, com validação humana:", "");
  for (const [phase, e] of byPhase.entries()) {
    lines.push(`- **${phase}** — ${e.count} sugestão(ões); modelo: ${[...e.models].join(", ")}`);
  }
  return lines.join("\n");
}

/** Desvios do protocolo — emendas datadas pós-travamento (FR-014/SC-004). Sem LLM. */
export function buildDeviations(i: ReportInputs): string {
  const lines: string[] = ["## Desvios do protocolo", ""];
  if (i.amendments.length === 0) {
    lines.push("Nenhum desvio registrado após o travamento do protocolo.");
    return lines.join("\n");
  }
  for (const a of i.amendments) {
    lines.push(`- **v${a.version}** (${a.datedAt}): ${JSON.stringify(a.change)}`);
  }
  return lines.join("\n");
}

/** Declaração de fases opcionais desligadas (FR-015/SC-009). */
export function buildOptionalPhasesDeclaration(i: ReportInputs): string {
  if (i.optionalPhasesOff.length === 0) return "";
  const labels = i.optionalPhasesOff.map((p) => p.label).join(" e ");
  return (
    "### Fases opcionais não conduzidas\n\n" +
    `As seguintes fases metodológicas opcionais não foram conduzidas nesta revisão: ${labels}.`
  );
}

/** Monta as 4 seções determinísticas na ordem do relatório. */
export function buildDeterministicSections(i: ReportInputs): BuiltSection[] {
  return [
    { kind: "methods", content: buildMethodsSection(i), order: 0 },
    { kind: "results", content: buildResultsSection(i), order: 1 },
    { kind: "ai_declaration", content: buildAiDeclaration(i), order: 4 },
    { kind: "deviations", content: buildDeviations(i), order: 5 },
  ];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`; // dd/mm/aaaa (convenção UI)
}
```

> Nota de ordem: Discussão=2, Conclusão=3 (entre Resultados e declaração-IA); as seções de IA são criadas pelo worker (Task 5) com esses `order`. As determinísticas usam 0,1,4,5.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/report-sections.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/report/types.ts src/lib/report/sections.ts tests/unit/report-sections.test.ts
git commit -m "feat(report): pure deterministic section builders (Methods/Results/AI-decl/Deviations)"
```

---

## Task 4: Camada IO — `loadReportInputs` / `loadReport` / `resolveReport`

**Files:**
- Create: `src/lib/report/queries.ts`
- Test: `tests/integration/report.test.ts` (estende)

Carrega `ReportInputs` reusando os helpers existentes, mas com **deps-injection** (`{ supabase }`) para ser testável fora do server runtime (memória: testes de integração não podem chamar wrappers que usam `createClient()` de server). Por isso a IO do relatório recebe o client.

- [ ] **Step 1: Add the failing integration test** (append em `tests/integration/report.test.ts`)

Adicione ao **topo** do arquivo (imports são hoisted, mas mantenha-os juntos p/ `import/first`):
`import { loadReportInputs, resolveReport, loadReport } from "@/lib/report/queries";`

```ts
describe("loadReportInputs / resolveReport (IO, deps-injection)", () => {
  it("carrega contadores PRISMA, temas e fases opcionais OFF", async () => {
    const { svc, reviewId } = await seedReview("io");
    const inputs = await loadReportInputs({ supabase: svc }, reviewId);
    expect(inputs.counters).toBeDefined();
    expect(Array.isArray(inputs.themes)).toBe(true);
    expect(Array.isArray(inputs.aiSuggestions)).toBe(true);
    expect(inputs.optionalPhasesOff.length).toBe(2); // Viés + Certeza OFF (v1)
  });

  it("resolveReport cria a row report 1:1 idempotente", async () => {
    const { svc, reviewId } = await seedReview("resolve");
    const a = await resolveReport({ supabase: svc }, reviewId);
    const b = await resolveReport({ supabase: svc }, reviewId);
    expect(a).toBe(b); // mesmo id
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/integration/report.test.ts`
Expected: FAIL — `@/lib/report/queries` não existe.

- [ ] **Step 3: Implement the IO layer** (`src/lib/report/queries.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportInputs, SectionKind, EditState } from "./types";
import { composeSuggestedQuery } from "@/lib/search/suggest";

interface Deps {
  supabase: SupabaseClient;
}

const OPTIONAL_PHASES_OFF = [
  { key: "risk_of_bias", label: "Risco de Viés" },
  { key: "certainty", label: "Certeza (CERQual)" },
]; // D19: ambas OFF na v1.

/** Lê todos os insumos factuais p/ as seções determinísticas. */
export async function loadReportInputs(
  deps: Deps,
  reviewId: string,
): Promise<ReportInputs> {
  const { supabase } = deps;

  const [
    questionRes,
    criteriaRes,
    protocolRes,
    searchTermsRes,
    searchesRes,
    counterRes,
    exclusionRes,
    amendmentRes,
    synthesisRes,
    aiSugRes,
  ] = await Promise.all([
    supabase.from("question").select("framework, question_text, fields").eq("review_id", reviewId).maybeSingle(),
    supabase.from("eligibility_criterion").select("kind, text").eq("review_id", reviewId).order("created_at"),
    supabase.from("protocol").select("state, locked_at").eq("review_id", reviewId).maybeSingle(),
    supabase.from("eligibility_criterion").select("text").eq("review_id", reviewId).eq("kind", "search_term").neq("ratification_state", "rejected").order("created_at"),
    supabase.from("search").select("database, record(count)").eq("review_id", reviewId).order("created_at", { ascending: false }),
    supabase.from("prisma_counter").select("identified, duplicates, screened, included_ts, excluded_ts, maybe_ts, included_ft, excluded_ft, passed_ts").eq("review_id", reviewId).maybeSingle(),
    supabase.from("prisma_exclusion_breakdown").select("reason_id, reason_label, n").eq("review_id", reviewId).order("n", { ascending: false }),
    supabase.from("protocol_amendment").select("version, change, dated_at").eq("review_id", reviewId).order("version"),
    supabase.from("synthesis").select("id").eq("review_id", reviewId).maybeSingle(),
    supabase.from("ai_suggestion").select("target_kind, provenance, state").eq("review_id", reviewId),
  ]);

  // Temas RATIFICADOS (accepted/edited) da síntese (US1) — fonte da narrativa de Resultados.
  let themes: { name: string; narrative: string }[] = [];
  const synthesisId = (synthesisRes.data as { id: string } | null)?.id;
  if (synthesisId) {
    const { data: themeRows } = await supabase
      .from("theme")
      .select("name, narrative, order")
      .eq("synthesis_id", synthesisId)
      .in("state", ["accepted", "edited"])
      .order("order");
    themes = ((themeRows ?? []) as { name: string; narrative: string }[]).map((t) => ({
      name: t.name,
      narrative: t.narrative,
    }));
  }

  const c = counterRes.data as Record<string, number> | null;

  return {
    question: questionRes.data
      ? {
          framework: (questionRes.data as { framework: string }).framework,
          questionText: (questionRes.data as { question_text: string }).question_text,
          fields: ((questionRes.data as { fields: Record<string, string> }).fields) ?? {},
        }
      : null,
    criteria: (criteriaRes.data ?? []) as ReportInputs["criteria"],
    protocol: protocolRes.data
      ? {
          state: (protocolRes.data as { state: "draft" | "locked" }).state,
          lockedAt: (protocolRes.data as { locked_at: string | null }).locked_at,
        }
      : null,
    searchQuery: composeSuggestedQuery(((searchTermsRes.data ?? []) as { text: string }[]).map((r) => r.text)),
    searches: ((searchesRes.data ?? []) as { database: string; record: { count: number }[] | null }[]).map((s) => ({
      database: s.database,
      recordCount: s.record?.[0]?.count ?? 0,
    })),
    counters: {
      identified: c?.identified ?? 0,
      duplicates: c?.duplicates ?? 0,
      screened: c?.screened ?? 0,
      includedTs: c?.included_ts ?? 0,
      excludedTs: c?.excluded_ts ?? 0,
      maybeTs: c?.maybe_ts ?? 0,
      passedTs: c?.passed_ts ?? 0,
      includedFt: c?.included_ft ?? 0,
      excludedFt: c?.excluded_ft ?? 0,
    },
    exclusions: ((exclusionRes.data ?? []) as { reason_id: string; reason_label: string; n: number }[]).map((e) => ({
      reasonId: e.reason_id ?? "",
      reasonLabel: e.reason_label ?? "",
      n: e.n ?? 0,
    })),
    amendments: ((amendmentRes.data ?? []) as { version: number; change: Record<string, unknown>; dated_at: string }[]).map((a) => ({
      version: a.version,
      datedAt: a.dated_at,
      change: a.change,
    })),
    themes,
    aiSuggestions: ((aiSugRes.data ?? []) as { target_kind: string; provenance: { model?: string; version?: string }; state: string }[]).map((s) => ({
      targetKind: s.target_kind,
      model: s.provenance?.model ?? "?",
      version: s.provenance?.version ?? "?",
      state: s.state,
    })),
    optionalPhasesOff: OPTIONAL_PHASES_OFF,
  };
}

export interface ReportSectionRow {
  id: string;
  kind: SectionKind;
  content: string;
  edit_state: EditState;
  ai_suggestion_id: string | null;
  order: number;
}

/** Resolve (ou cria) a row report 1:1 da Revisão; retorna o id. */
export async function resolveReport(deps: Deps, reviewId: string): Promise<string> {
  const { supabase } = deps;
  const { data: existing } = await supabase
    .from("report")
    .select("id")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created, error } = await supabase
    .from("report")
    .insert({ review_id: reviewId, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (created as { id: string }).id;
}

/** Carrega report + seções (ordenadas) p/ a UI. */
export async function loadReport(
  deps: Deps,
  reviewId: string,
): Promise<{ id: string; status: string; sections: ReportSectionRow[] } | null> {
  const { supabase } = deps;
  const { data: report } = await supabase
    .from("report")
    .select("id, status")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!report) return null;
  const reportId = (report as { id: string }).id;
  const { data: sections, error } = await supabase
    .from("report_section")
    .select('id, kind, content, edit_state, ai_suggestion_id, "order"')
    .eq("report_id", reportId)
    .order("order");
  if (error) throw new Error(error.message);
  return {
    id: reportId,
    status: (report as { status: string }).status,
    sections: (sections ?? []) as unknown as ReportSectionRow[],
  };
}
```

- [ ] **Step 4: Run the integration test**

Run: `npx vitest run tests/integration/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report/queries.ts tests/integration/report.test.ts
git commit -m "feat(report): IO layer loadReportInputs/loadReport/resolveReport (deps-injection)"
```

---

## Task 5: Worker Node — `processReportDraftJob` (determinístico + drafts IA)

**Files:**
- Create: `src/lib/report/enqueue.ts`
- Create: `src/lib/report/batch-worker.ts`
- Create: `src/lib/report/batch-run.ts`
- Test: `tests/integration/report.test.ts` (estende)

Espelha `synthesis/{enqueue,batch-worker,batch-run}.ts`: marca job running → resolve report → **(re)monta as 4 seções determinísticas preservando `human_edited` em Métodos** → por item (`discussion`/`conclusion`) chama `draftReportSection` resiliente, **preserva** se `human_edited`, grava `ai_suggestion` + `ai_usage(phase='report')` + seção `ai_generated` → marca report `ready` → finaliza job.

- [ ] **Step 1: Add the failing integration test** (append em `tests/integration/report.test.ts`)

Adicione ao **topo** do arquivo:
```ts
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueReportDraftJob } from "@/lib/report/enqueue";
import { runReportDraftWorkerWith } from "@/lib/report/batch-run";
```

```ts
describe("processReportDraftJob (worker)", () => {
  it("monta 4 determinísticas + rascunha Discussão/Conclusão (ai_generated) + ai_usage report", async () => {
    const { svc, member, reviewId } = await seedReview("worker");
    await enqueueReportDraftJob({ supabase: member }, reviewId); // RPC gated ⇒ client member
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId); // worker ⇒ service client

    const rep = await loadReport({ supabase: svc }, reviewId);
    expect(rep).not.toBeNull();
    expect(rep!.status).toBe("ready");
    const kinds = rep!.sections.map((s) => s.kind).sort();
    expect(kinds).toEqual(
      ["ai_declaration", "conclusion", "deviations", "discussion", "methods", "results"].sort(),
    );
    const disc = rep!.sections.find((s) => s.kind === "discussion")!;
    expect(disc.edit_state).toBe("ai_generated");
    expect(disc.ai_suggestion_id).not.toBeNull();

    const { count } = await svc
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId)
      .eq("phase", "report");
    expect((count ?? 0) >= 1).toBe(true);
  });

  it("regeneração via worker PRESERVA Discussão human_edited", async () => {
    const { svc, member, reviewId } = await seedReview("worker-preserve");
    await enqueueReportDraftJob({ supabase: member }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const rep0 = await loadReport({ supabase: svc }, reviewId);
    const disc = rep0!.sections.find((s) => s.kind === "discussion")!;
    await member.rpc("set_report_section_content", {
      p_section_id: disc.id,
      p_content: "DISCUSSÃO EDITADA PELO HUMANO",
    });

    await enqueueReportDraftJob({ supabase: member }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const rep1 = await loadReport({ supabase: svc }, reviewId);
    const disc1 = rep1!.sections.find((s) => s.kind === "discussion")!;
    expect(disc1.content).toBe("DISCUSSÃO EDITADA PELO HUMANO");
    expect(disc1.edit_state).toBe("human_edited");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/integration/report.test.ts`
Expected: FAIL — módulos de worker não existem.

- [ ] **Step 3: Implement enqueue** (`src/lib/report/enqueue.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReportEnqueueResult {
  job_id: string;
  status: "queued";
  item_count: number;
}

/** Cria o job report_draft (RPC create_report_draft_job). Só enfileira (§VIII). */
export async function enqueueReportDraftJob(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<ReportEnqueueResult> {
  const { data: job, error } = await deps.supabase.rpc("create_report_draft_job", {
    p_review_id: reviewId,
  });
  if (error) throw new Error(error.message);
  const jobId = (job as { id: string }).id;
  const { count } = await deps.supabase
    .from("job_item")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);
  return { job_id: jobId, status: "queued", item_count: count ?? 0 };
}
```

- [ ] **Step 4: Implement the worker** (`src/lib/report/batch-worker.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider, ThemeSummary } from "@/lib/ai/llm/types";
import { buildDeterministicSections } from "./sections";
import { loadReportInputs, resolveReport } from "./queries";

interface JobRow {
  id: string;
  review_id: string;
}
interface JobItemRow {
  id: string;
  payload: { kind: "discussion" | "conclusion" };
  attempts: number;
}
interface SectionRow {
  id: string;
  edit_state: string;
}

export interface ReportBatchDeps {
  supabase: SupabaseClient;
  provider: LLMProvider;
}
export interface ReportBatchResult {
  job_id: string;
  status: "completed" | "completed_with_errors" | "failed";
  done: number;
  failed: number;
}

const SECTION_ORDER: Record<string, number> = {
  methods: 0, results: 1, discussion: 2, conclusion: 3, ai_declaration: 4, deviations: 5,
};

export async function processReportDraftJob(
  deps: ReportBatchDeps,
  jobId: string,
): Promise<ReportBatchResult> {
  const { supabase, provider } = deps;

  await supabase.from("job").update({ status: "running", started_at: new Date().toISOString() }).eq("id", jobId);

  const { data: jobData, error: jobErr } = await supabase
    .from("job").select("id, review_id").eq("id", jobId).single();
  if (jobErr) throw new Error(jobErr.message);
  const reviewId = (jobData as JobRow).review_id;

  const reportId = await resolveReport({ supabase }, reviewId);
  await supabase.from("report").update({ status: "generating" }).eq("id", reportId);

  const inputs = await loadReportInputs({ supabase }, reviewId);

  // ── 1. Determinísticas: upsert preservando human_edited (Métodos pode estar editada) ──
  for (const sec of buildDeterministicSections(inputs)) {
    await upsertSection(supabase, reviewId, reportId, sec.kind, sec.content, "deterministic", null, sec.order);
  }

  // ── 2. Seções de IA, resiliente por-item ──
  const { data: items, error: itemsErr } = await supabase
    .from("job_item").select("id, payload, attempts").eq("job_id", jobId).eq("status", "pending");
  if (itemsErr) throw new Error(itemsErr.message);

  const methods = buildDeterministicContent(inputs, "methods");
  const results = buildDeterministicContent(inputs, "results");
  const themes: ThemeSummary[] = inputs.themes;

  let done = 0;
  let failed = 0;
  for (const it of (items ?? []) as JobItemRow[]) {
    const kind = it.payload.kind;
    try {
      // Preserva human_edited: não sobrescreve e não chama LLM.
      const { data: existing } = await supabase
        .from("report_section")
        .select("id, edit_state").eq("report_id", reportId).eq("kind", kind).maybeSingle<SectionRow>();
      if (existing?.edit_state === "human_edited") {
        await markItemDone(supabase, it.id);
        done++;
        continue;
      }

      const drafted = await provider.draftReportSection({
        kind, language: "pt-BR", context: { methods, results, themes },
      });

      // Insere a seção (sem ai_suggestion_id ainda) p/ obter o id.
      const sectionId = await upsertSection(
        supabase, reviewId, reportId, kind, drafted.content, "ai_generated", null, SECTION_ORDER[kind],
      );

      // ai_suggestion (target→suggestion→link), padrão Marco 2.
      const { data: sug, error: sugErr } = await supabase
        .from("ai_suggestion")
        .insert({
          review_id: reviewId,
          target_kind: "report_section",
          target_id: sectionId,
          output: { kind, content: drafted.content },
          provenance: drafted.provenance,
          state: "pending",
        })
        .select("id").single();
      if (sugErr) throw new Error(sugErr.message);
      await supabase
        .from("report_section")
        .update({ ai_suggestion_id: (sug as { id: string }).id })
        .eq("id", sectionId);

      // ai_usage (FR-026)
      await supabase.from("ai_usage").insert({
        review_id: reviewId, phase: "report", tokens_in: 0, tokens_out: 0, cost: {}, job_id: jobId,
      });

      await markItemDone(supabase, it.id);
      done++;
    } catch (e) {
      await supabase
        .from("job_item")
        .update({ status: "failed", error: String(e), attempts: (it.attempts ?? 0) + 1 })
        .eq("id", it.id);
      failed++;
    }
  }

  await supabase.from("report").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", reportId);

  const status: ReportBatchResult["status"] = failed === 0 ? "completed" : "completed_with_errors";
  await supabase
    .from("job")
    .update({ status: status === "completed" ? "completed" : "completed", progress: 100, finished_at: new Date().toISOString() })
    .eq("id", jobId);

  return { job_id: jobId, status, done, failed };
}

// Constrói só o conteúdo determinístico de uma seção (p/ contexto do LLM).
function buildDeterministicContent(inputs: Parameters<typeof buildDeterministicSections>[0], kind: string): string {
  return buildDeterministicSections(inputs).find((s) => s.kind === kind)?.content ?? "";
}

async function upsertSection(
  supabase: SupabaseClient, reviewId: string, reportId: string,
  kind: string, content: string, editState: string, aiSuggestionId: string | null, order: number,
): Promise<string> {
  // Preserva human_edited: se já existe e está human_edited, não toca.
  const { data: existing } = await supabase
    .from("report_section")
    .select("id, edit_state").eq("report_id", reportId).eq("kind", kind).maybeSingle<SectionRow>();
  if (existing) {
    if (existing.edit_state === "human_edited") return existing.id;
    await supabase
      .from("report_section")
      .update({ content, edit_state: editState, ai_suggestion_id: aiSuggestionId, order, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data: created, error } = await supabase
    .from("report_section")
    .insert({ review_id: reviewId, report_id: reportId, kind, content, edit_state: editState, ai_suggestion_id: aiSuggestionId, order })
    .select("id").single();
  if (error) throw new Error(error.message);
  return (created as { id: string }).id;
}

async function markItemDone(supabase: SupabaseClient, itemId: string): Promise<void> {
  await supabase.from("job_item").update({ status: "done" }).eq("id", itemId);
}
```

> Verifique o valor de `job_item_status` "concluído" no enum (`0003_search_record_jobs.sql`): use o mesmo literal que `synthesis/batch-worker.ts` usa em `_finalizeJob` (provavelmente `'done'`). Se o synthesis usa outro literal, alinhe `markItemDone` a ele.

- [ ] **Step 5: Implement batch-run** (`src/lib/report/batch-run.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMProvider } from "@/lib/ai/llm/types";
import { processReportDraftJob } from "./batch-worker";

/** Processa todos os jobs report_draft ativos da Revisão. Espelha runSynthesisBatchWorkerWith. */
export async function runReportDraftWorkerWith(
  supabase: SupabaseClient,
  provider: LLMProvider,
  reviewId: string,
): Promise<void> {
  const { data: jobs, error } = await supabase
    .from("job").select("id").eq("review_id", reviewId).eq("type", "report_draft").in("status", ["queued", "running"]);
  if (error) throw new Error(error.message);
  for (const j of (jobs ?? []) as Array<{ id: string }>) {
    await processReportDraftJob({ supabase, provider }, j.id);
  }
}
```

- [ ] **Step 6: Run the integration tests**

Run: `npx vitest run tests/integration/report.test.ts`
Expected: PASS (incl. preservação de `human_edited`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/report/enqueue.ts src/lib/report/batch-worker.ts src/lib/report/batch-run.ts tests/integration/report.test.ts
git commit -m "feat(report): report_draft worker (deterministic build + AI drafts, resilient, preserves human_edited)"
```

---

## Task 6: Regeneração determinística + server actions

**Files:**
- Create: `src/lib/report/regenerate.ts`
- Create: `app/reviews/[reviewId]/report/actions.ts`
- Test: `tests/integration/report.test.ts` (estende)

`regenerateReport` (server action, **sem LLM**) reescreve as seções determinísticas refletindo o estado atual (inclui a síntese ratificada corrente — A3) e **preserva** `human_edited` (ex.: Métodos editado), retornando `{ regenerated, preserved }` (FR-016/§III). Re-rascunho de Discussão/Conclusão é o job `report_draft` (Task 5), sempre explícito e com `estimateCost` antes (§VII).

- [ ] **Step 1: Add the failing integration test** (append em `tests/integration/report.test.ts`)

Adicione ao **topo** do arquivo:
`import { regenerateDeterministicSections } from "@/lib/report/regenerate";`

```ts
describe("regenerateDeterministicSections (FR-016)", () => {
  it("reescreve determinísticas e preserva Métodos human_edited", async () => {
    const { svc, member, reviewId } = await seedReview("regen");
    await enqueueReportDraftJob({ supabase: member }, reviewId);
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const rep = await loadReport({ supabase: svc }, reviewId);
    const methods = rep!.sections.find((s) => s.kind === "methods")!;
    await member.rpc("set_report_section_content", {
      p_section_id: methods.id, p_content: "MÉTODOS EDITADO",
    });

    const res = await regenerateDeterministicSections({ supabase: svc }, reviewId);
    expect(res.preserved).toContain("methods");
    expect(res.regenerated).toContain("results");
    expect(res.regenerated).toContain("ai_declaration");

    const rep2 = await loadReport({ supabase: svc }, reviewId);
    expect(rep2!.sections.find((s) => s.kind === "methods")!.content).toBe("MÉTODOS EDITADO");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/integration/report.test.ts`
Expected: FAIL — `regenerate.ts` não existe.

- [ ] **Step 3: Implement regenerate** (`src/lib/report/regenerate.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionKind } from "./types";
import { buildDeterministicSections } from "./sections";
import { loadReportInputs, resolveReport } from "./queries";

export interface RegenerateResult {
  regenerated: SectionKind[];
  preserved: SectionKind[];
}

/** Reescreve as seções determinísticas do estado atual; preserva human_edited (FR-016). */
export async function regenerateDeterministicSections(
  deps: { supabase: SupabaseClient },
  reviewId: string,
): Promise<RegenerateResult> {
  const { supabase } = deps;
  const reportId = await resolveReport({ supabase }, reviewId);
  const inputs = await loadReportInputs({ supabase }, reviewId);

  const regenerated: SectionKind[] = [];
  const preserved: SectionKind[] = [];

  for (const sec of buildDeterministicSections(inputs)) {
    const { data: existing } = await supabase
      .from("report_section")
      .select("id, edit_state").eq("report_id", reportId).eq("kind", sec.kind).maybeSingle();
    if (existing && (existing as { edit_state: string }).edit_state === "human_edited") {
      preserved.push(sec.kind);
      continue;
    }
    if (existing) {
      await supabase
        .from("report_section")
        .update({ content: sec.content, edit_state: "deterministic", order: sec.order, updated_at: new Date().toISOString() })
        .eq("id", (existing as { id: string }).id);
    } else {
      await supabase
        .from("report_section")
        .insert({ review_id: reviewId, report_id: reportId, kind: sec.kind, content: sec.content, edit_state: "deterministic", order: sec.order });
    }
    regenerated.push(sec.kind);
  }
  return { regenerated, preserved };
}
```

- [ ] **Step 4: Implement server actions** (`app/reviews/[reviewId]/report/actions.ts`) — espelha `synthesis/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLLMProvider } from "@/lib/ai/llm";
import { MissingByokError } from "@/lib/ai/llm/types";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueReportDraftJob } from "@/lib/report/enqueue";
import { runReportDraftWorkerWith } from "@/lib/report/batch-run";
import { regenerateDeterministicSections } from "@/lib/report/regenerate";

async function requireMember(reviewId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase.rpc("is_review_member", { p_review_id: reviewId });
  if (error || !data) throw new Error("not a member");
  return { supabase };
}

function revalidate(reviewId: string) {
  revalidatePath(`/reviews/${reviewId}/report`);
}

async function resolveProvider(reviewId: string) {
  try {
    return await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) return new MockLLMProvider();
    throw e;
  }
}

/** Estimativa antes de rascunhar Discussão/Conclusão (§VII). */
export async function estimateReport(reviewId: string) {
  await requireMember(reviewId);
  let byokMissing = false;
  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError) { provider = new MockLLMProvider(); byokMissing = true; }
    else throw e;
  }
  const estimate = await provider.estimateCost({ kind: "report_draft", itemCount: 2 });
  return { ok: true as const, estimate, byokMissing };
}

/** Gera/regenera o relatório completo: enfileira report_draft (member client) e roda o worker (admin). */
export async function generateReport(reviewId: string) {
  // RPC SECURITY DEFINER gating em is_review_member ⇒ enfileira com o client do membro.
  const { supabase } = await requireMember(reviewId);
  const admin = createAdminClient();
  const provider = await resolveProvider(reviewId);
  await enqueueReportDraftJob({ supabase }, reviewId);
  await runReportDraftWorkerWith(admin, provider, reviewId);
  revalidate(reviewId);
  return { ok: true as const };
}

/** Regenera só as seções determinísticas (sem LLM, sem custo); preserva human_edited. */
export async function regenerateReport(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const res = await regenerateDeterministicSections({ supabase }, reviewId);
  revalidate(reviewId);
  return { ok: true as const, ...res };
}

/** Edita uma seção → human_edited (RPC auditada). Resultados/decl-IA/desvios são rejeitados pela RPC. */
export async function editReportSection(reviewId: string, sectionId: string, content: string) {
  const { supabase } = await requireMember(reviewId);
  const { error } = await supabase.rpc("set_report_section_content", {
    p_section_id: sectionId, p_content: content,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidate(reviewId);
  return { ok: true as const };
}
```

- [ ] **Step 5: Run the integration tests**

Run: `npx vitest run tests/integration/report.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/report/regenerate.ts "app/reviews/[reviewId]/report/actions.ts" tests/integration/report.test.ts
git commit -m "feat(report): regenerate (preserves human_edited) + server actions (generate/regenerate/edit)"
```

---

## Task 7: Trilho de fases — adicionar fase `report`

**Files:**
- Modify: `src/lib/shell/phases.ts`
- Test: `tests/unit/phases.test.ts`

- [ ] **Step 1: Add the failing test** (append em `tests/unit/phases.test.ts`; se o arquivo não existir, crie espelhando os casos existentes de `computePhaseStates`)

```ts
import { computePhaseStates, type PhaseInput } from "@/lib/shell/phases";

const fullInput: PhaseInput = {
  hasQuestion: true, protocolStatus: "locked", identified: 10, duplicates: 0,
  screenedTs: 10, includedTs: 5, passedTs: 5, includedFt: 5, excludedFt: 0,
  extractionRatified: true, synthesisReady: true, reportReady: false,
};

describe("fase report no trilho", () => {
  it("aparece após Síntese e fica locked até a síntese concluir", () => {
    const phases = computePhaseStates("rev1", { ...fullInput, synthesisReady: false });
    const report = phases.find((p) => p.key === "report")!;
    expect(report).toBeDefined();
    expect(report.status).toBe("locked");
  });
  it("conclui quando reportReady=true", () => {
    const phases = computePhaseStates("rev1", { ...fullInput, reportReady: true });
    const report = phases.find((p) => p.key === "report")!;
    expect(report.status).toBe("done");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/unit/phases.test.ts`
Expected: FAIL — `reportReady` não existe em `PhaseInput`; sem fase `report`.

- [ ] **Step 3: Extend `phases.ts`**

1. Em `PhaseKey`, adicione `| "report"` (após `"synthesis"`).
2. Em `PhaseInput`, adicione:

```ts
  /** Relatório estruturado concluído (report.status === 'ready'). */
  reportReady: boolean;
```

3. No array `PIPELINE`, após a entrada `synthesis`, adicione:

```ts
  {
    key: "report",
    label: "Relatório",
    href: (r) => `/reviews/${r}/report`,
    // Bloqueada até a síntese concluir (Resultados embute a síntese ratificada).
    isLocked: (i) => !i.synthesisReady,
    completed: (i) => i.reportReady,
  },
```

4. Em `loadPhaseStates`, carregue `reportReady` (espelha o load de `synthesisReady`):

```ts
  const { data: reportRow } = await supabase
    .from("report").select("status").eq("review_id", reviewId).maybeSingle();
  const reportReady = reportRow?.status === "ready";
```

e inclua `reportReady` no objeto `PhaseInput` passado a `computePhaseStates`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/phases.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell/phases.ts tests/unit/phases.test.ts
git commit -m "feat(report): add report phase to the review trail"
```

---

## Task 8: UI — `report/page.tsx` + componentes (embute fluxograma)

**Files:**
- Create: `app/reviews/[reviewId]/report/page.tsx`
- Create: `src/components/report/ReportRunner.tsx`
- Create: `src/components/report/SectionView.tsx`
- Create: `src/components/report/SectionEditor.tsx`
- Create: `src/components/report/RegenerateButton.tsx`

Reusa `src/components/ai/*` (AsyncActionButton) e `src/components/prisma/PrismaFlowchart`. A página é Server Component: carrega report + fluxograma e renderiza. Edição/geração via os componentes client que chamam as server actions da Task 6.

- [ ] **Step 1: `SectionView`** (`src/components/report/SectionView.tsx`)

```tsx
export function SectionView({ content }: { content: string }) {
  return (
    <article className="prose prose-sm max-w-none whitespace-pre-wrap">{content}</article>
  );
}
```

- [ ] **Step 2: `SectionEditor`** (client) (`src/components/report/SectionEditor.tsx`)

```tsx
"use client";
import { useState, useTransition } from "react";
import { editReportSection } from "@/app/reviews/[reviewId]/report/actions";

export function SectionEditor({
  reviewId, sectionId, kind, initial,
}: { reviewId: string; sectionId: string; kind: string; initial: string }) {
  const [content, setContent] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  // A3: Resultados/decl-IA/desvios não são editáveis.
  const editable = kind === "methods" || kind === "discussion" || kind === "conclusion";
  if (!editable) {
    return <article className="prose prose-sm max-w-none whitespace-pre-wrap">{initial}</article>;
  }
  return (
    <div className="space-y-2">
      <textarea
        className="w-full min-h-40 rounded border p-2 font-mono text-sm"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button
        className="rounded bg-ink px-3 py-1 text-sm text-paper disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await editReportSection(reviewId, sectionId, content);
            setMsg(r.ok ? "Seção salva (editada pelo humano)." : `Erro: ${r.error}`);
          })
        }
      >
        {pending ? "Salvando…" : "Salvar edição"}
      </button>
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 3: `ReportRunner`** (client) (`src/components/report/ReportRunner.tsx`)

```tsx
"use client";
import { useState, useTransition } from "react";
import { estimateReport, generateReport } from "@/app/reviews/[reviewId]/report/actions";

export function ReportRunner({ reviewId, hasReport }: { reviewId: string; hasReport: boolean }) {
  const [pending, start] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex gap-2">
        <button
          className="rounded border px-3 py-1 text-sm"
          disabled={pending}
          onClick={() => start(async () => {
            const e = await estimateReport(reviewId);
            setInfo(`Estimativa: ~${e.estimate.tokensEstimated} tokens` + (e.byokMissing ? " (sem chave: modo simulado)" : ""));
          })}
        >
          Estimar custo
        </button>
        <button
          className="rounded bg-ink px-3 py-1 text-sm text-paper"
          disabled={pending}
          onClick={() => start(async () => {
            await generateReport(reviewId);
            setInfo("Relatório gerado.");
          })}
        >
          {hasReport ? "Regerar tudo (com IA)" : "Gerar relatório"}
        </button>
      </div>
      {info && <p className="text-xs text-ink-soft">{info}</p>}
    </div>
  );
}
```

- [ ] **Step 4: `RegenerateButton`** (client) (`src/components/report/RegenerateButton.tsx`)

```tsx
"use client";
import { useState, useTransition } from "react";
import { regenerateReport } from "@/app/reviews/[reviewId]/report/actions";

export function RegenerateButton({ reviewId }: { reviewId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        className="rounded border px-3 py-1 text-sm"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await regenerateReport(reviewId);
          if (r.ok) {
            setMsg(
              `Regeneradas: ${r.regenerated.join(", ") || "nenhuma"}.` +
                (r.preserved.length ? ` Preservadas (editadas): ${r.preserved.join(", ")}.` : ""),
            );
          }
        })}
      >
        {pending ? "Regenerando…" : "Atualizar seções factuais"}
      </button>
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 5: `page.tsx`** (Server Component) (`app/reviews/[reviewId]/report/page.tsx`)

```tsx
import { createClient } from "@/lib/supabase/server";
import { loadReport } from "@/lib/report/queries";
import { loadPrismaFlowModel } from "@/lib/prisma/flow-model";
import { PrismaFlowchart } from "@/components/prisma/PrismaFlowchart";
import { ReportRunner } from "@/components/report/ReportRunner";
import { RegenerateButton } from "@/components/report/RegenerateButton";
import { SectionEditor } from "@/components/report/SectionEditor";

const SECTION_LABEL: Record<string, string> = {
  methods: "Métodos", results: "Resultados", discussion: "Discussão",
  conclusion: "Conclusão", ai_declaration: "Declaração de uso de IA", deviations: "Desvios do protocolo",
};

export default async function ReportPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const supabase = await createClient();
  const report = await loadReport({ supabase }, reviewId);
  const flowModel = await loadPrismaFlowModel(reviewId);

  return (
    <div className="space-y-6 p-6">
      <h1 className="title-serif text-2xl">Relatório</h1>
      <ReportRunner reviewId={reviewId} hasReport={!!report} />
      {report && <RegenerateButton reviewId={reviewId} />}

      {!report && <p className="text-ink-soft">Gere o relatório para começar.</p>}

      {report?.sections.map((s) => (
        <section key={s.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="title-serif text-lg">{SECTION_LABEL[s.kind] ?? s.kind}</h2>
            <span className="text-xs text-ink-soft">[{s.edit_state}]</span>
          </div>
          <SectionEditor reviewId={reviewId} sectionId={s.id} kind={s.kind} initial={s.content} />
          {s.kind === "results" && (
            <div className="mt-4">
              <PrismaFlowchart reviewId={reviewId} model={flowModel} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Type-check + lint (UI não tem teste unitário dedicado; validar via tsc/lint)**

Run: `npx tsc --noEmit && npm run lint`
Expected: sem erros nos arquivos novos.

- [ ] **Step 7: Commit**

```bash
git add "app/reviews/[reviewId]/report/page.tsx" src/components/report/
git commit -m "feat(report): report page UI (sections, editor, regenerate, embedded PRISMA flowchart)"
```

---

## Task 9: Verificação final da fatia (CHECKPOINT 3 prep)

**Files:** nenhuma alteração de código — só verificação (use `superpowers:verification-before-completion`).

- [ ] **Step 1: Suíte de testes da fatia**

Run: `npx vitest run tests/unit/report-sections.test.ts tests/unit/llm-contract.test.ts tests/unit/phases.test.ts tests/integration/report.test.ts`
Expected: tudo verde.

- [ ] **Step 2: Suíte completa (não-regressão Marcos 1–2 + Fatia 2)**

Run: `npx vitest run`
Expected: tudo verde (nenhuma regressão).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 erros.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 5: Escrever o COMPLETION da fatia**

Crie `specs/003-marco3-saida-sintese-relatorio/.superpowers/COMPLETION-fatia-3.md` (espelha `COMPLETION-fatia-2.md`): resumo, FR/SC cobertos (US3 — FR-012..017, FR-024; SC-003, SC-004, SC-009 declaração), arquivos tocados, resultado de testes/lint/tsc, e a nota A3 (Resultados deterministic-only). Atualize a tabela de "Estado de execução" em `slicing.md` (linha da Fatia 3) — **mas não faça merge**.

- [ ] **Step 6: PARAR (CHECKPOINT 3)**

Apresente ao desenvolvedor: branch `build/003-marco3-saida-sintese-relatorio/3-report`, o diff, e os resultados de `vitest`/`lint`/`tsc`. **Aguarde o merge manual.** Não inicie a Fatia 4.

---

## Self-Review (preenchido)

**Cobertura do escopo da Fatia 3 (slicing §"Fatia 3"):**
- Migration `report`/`report_section` + `ALTER ai_target_kind +report_section` + `ALTER job_type +report_draft` + RLS + RPC `create_report_draft_job` → **Task 1**. ✓
- `editReportSection`/`regenerateReport` com `audit_entry` → **Task 1 (RPC auditada) + Task 6**. ✓
- Builders determinísticos (Methods/Results/AI-decl/Deviations/OptionalPhases) → **Task 3**; Resultados embute síntese ratificada (A3) → **Task 3 + Task 4 (themes ratificados)**. ✓
- `draftReportSection` + `estimateCost(report_draft)` + worker `processReportDraftJob` + `ai_usage phase report` → **Task 2 + Task 5**. ✓
- Regeneração preserva `human_edited` e avisa → **Task 5 (worker) + Task 6 (determinístico)**. ✓
- UI `report/page.tsx` + componentes + embute fluxograma da Fatia 1 + fase `report` no trilho → **Task 7 + Task 8**. ✓
- "Pronto quando": unit (montagem determinística, serialização markdown via builders, mock LLM Discussão/Conclusão) + integration (regeneração preserva human_edited; RLS) + lint+tsc → **Tasks 3/5/6/9**. ✓

**Consistência de tipos:** `ReportInputs`/`SectionKind`/`EditState` (types.ts) usados por sections.ts, queries.ts, regenerate.ts; `ThemeSummary`/`DraftedSection` (llm/types.ts) usados por mock/anthropic/worker; `reportReady` em PhaseInput usado por phases.test e loadPhaseStates. ✓

**Sem placeholders:** todo passo de código tem o código real; comandos com saída esperada. A única verificação aberta é o literal de `job_item_status` "concluído" (Task 5, Step 4 nota) — o executor confirma contra `synthesis/batch-worker.ts::_finalizeJob`. ✓

**Fronteiras:** characteristics/checklist (Fatia 4) e export (Fatias 5/6) explicitamente fora. ✓
