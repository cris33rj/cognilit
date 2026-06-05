# Fatia 11 — Re-derivação segura de critérios (idempotência + guarda de fase)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recomendado) ou superpowers:executing-plans para implementar tarefa a tarefa, cada
> uma em TDD. Os passos usam checkbox (`- [ ]`) para rastreio.
>
> **Escopo:** Fatia 11 do Marco 1 (`001-marco1-nucleo-fluxo`), correção/melhoria
> pós-Marco. Branch isolado `build/001-marco1-nucleo-fluxo/11-criteria-rederivation-guard`.
> A sessão **NUNCA** faz `git merge`/`git push` para a feature ou `main`.
> *(Planos de fatias anteriores permanecem no histórico git e em `.superpowers/`.)*
>
> **Não** adiciona FR nem altera decisão assinada (D); **reforça** FR-007/008
> (ratificação), FR-010 (trava na 1ª decisão de triagem) e FR-011 (emendas). Detalhe
> da fatia em `.superpowers/slicing.md` (§"Fatia 11").

**Goal:** Tornar "Derivar por IA" idempotente — re-clicar **regenera** (substitui só as
sugestões de IA ainda pendentes, preserva ratificados, deduplica o lote novo) em vez de
acumular; e **bloquear** a re-derivação depois que o protocolo trava, apontando o canal
de emenda.

**Architecture:** Toda a mutação autoritativa vive numa RPC nova
`regenerate_eligibility_criteria` (migration `0011`, `security definer` + `is_review_member`,
padrão das Fatias 8/8.1/9): recusa quando `protocol.state='locked'`, insere a `ai_suggestion`
(proveniência preservada), apaga **só** `eligibility_criterion` com `origin='ai' AND
ratification_state='pending'`, e insere o lote novo deduplicado por `normalize_reason_label`
(reuso da Fatia 8) contra os critérios sobreviventes. O server action `deriveCriteria` passa
a (a) pré-checar a trava — evitando gastar a chamada de LLM — e (b) chamar a RPC. A UI
(`CriteriaPanel`) troca o rótulo para "Regerar sugestões" + confirmação quando já há
critérios de IA, e desabilita com nota quando travado. A página da Pergunta passa a ler o
estado do protocolo.

**Tech Stack:** PostgreSQL (Supabase, RPC `security definer` + RLS via `is_review_member`,
reuso de `normalize_reason_label`/`lock_protocol`), Next.js 14 App Router (Server Actions,
RSC), React 18 + `AsyncActionButton` (Fatia 10), TypeScript strict, Vitest (unit +
integração DB-direta).

---

## Estrutura de arquivos

- **Criar** `supabase/migrations/0011_regenerate_eligibility_criteria.sql` — RPC
  autoritativa (guarda de trava + supersede de pendentes + dedupe + auditoria).
- **Criar** `tests/integration/criteria-rederivation.test.ts` — integração DB-direta da RPC.
- **Criar** `src/lib/question/criteria.ts` — helper puro `criteriaItemsFromOutput` (achata
  a saída do LLM em `{kind,text}[]`).
- **Criar** `tests/unit/question/criteria-items.test.ts` — unit do helper puro.
- **Modificar** `app/reviews/[reviewId]/question/actions.ts` — `deriveCriteria` pré-checa a
  trava e chama a RPC (remove insert cego + writeAudit manual).
- **Modificar** `src/components/question/CriteriaPanel.tsx` — "Regerar sugestões" +
  confirmação + `locked` (desabilita + nota).
- **Modificar** `tests/unit/question/criteria-panel.test.tsx` — testes novos (regerar/
  confirm/locked); os da Fatia 10 permanecem verdes.
- **Modificar** `app/reviews/[reviewId]/question/page.tsx` — lê `getProtocol` e passa
  `locked` ao `CriteriaPanel`.

> **Nota de teste (memória do projeto):** server actions usam `createClient()` server-side
> (cookies) e **não** podem ser chamados de testes Vitest. Por isso a lógica autoritativa
> fica na RPC (testada DB-direto) e no helper puro (unit). O `deriveCriteria` em si é cola
> fina, verificada por `tsc` + revisão.

> **Nota de ambiente:** os testes de **integração** exigem o Supabase local de pé com as
> migrations aplicadas (`npx supabase migration up`). `unit`/`lint`/`tsc` não exigem.

---

## Task 1: Migration 0011 — RPC `regenerate_eligibility_criteria` (TDD, integração DB-direta)

**Files:**
- Create: `supabase/migrations/0011_regenerate_eligibility_criteria.sql`
- Test: `tests/integration/criteria-rederivation.test.ts`

- [ ] **Step 1: Escrever o teste de integração que falha**

Crie `tests/integration/criteria-rederivation.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";

const PROV = {
  model: "test-model",
  version: "1",
  prompt_or_span: "teste",
  timestamp: new Date().toISOString(),
};
const OUTPUT = { inclusion: [], exclusion: [], searchTerms: [] };

describe("regenerate_eligibility_criteria — supersede + dedupe + guarda de trava (Fatia 11)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const s = Date.now();
    owner = (await signUpUser(`rederiv_${s}@example.com`, "senha-teste-123")).client;
    const { data: r } = await owner.rpc("create_review", { p_title: "Rederiv" });
    reviewId = r.id;
    await owner.from("question").insert({
      review_id: reviewId,
      framework: "spider",
      question_text: "Pergunta de teste",
    });
  });

  function regenerate(items: { kind: string; text: string }[]) {
    return owner.rpc("regenerate_eligibility_criteria", {
      p_review_id: reviewId,
      p_output: OUTPUT,
      p_provenance: PROV,
      p_not_found: false,
      p_items: items,
    });
  }

  async function listCriteria() {
    const svc = serviceClient();
    const { data } = await svc
      .from("eligibility_criterion")
      .select("kind, text, origin, ratification_state")
      .eq("review_id", reviewId)
      .order("created_at", { ascending: true });
    return data ?? [];
  }

  it("primeira derivação insere o lote (count = nº de itens)", async () => {
    const { data, error } = await regenerate([
      { kind: "inclusion", text: "Adultos" },
      { kind: "exclusion", text: "Crianças" },
      { kind: "search_term", text: "ansiedade" },
    ]);
    expect(error).toBeNull();
    expect(data).toBe(3);
    expect((await listCriteria()).length).toBe(3);
  });

  it("re-derivar substitui os pendentes — NÃO dobra (converge)", async () => {
    const { data, error } = await regenerate([
      { kind: "inclusion", text: "Adultos" },
      { kind: "exclusion", text: "Crianças" },
    ]);
    expect(error).toBeNull();
    expect(data).toBe(2);
    expect((await listCriteria()).length).toBe(2);
  });

  it("preserva ratificados e não re-propõe o que já foi decidido (dedupe)", async () => {
    const svc = serviceClient();
    await svc
      .from("eligibility_criterion")
      .update({ ratification_state: "accepted" })
      .eq("review_id", reviewId)
      .eq("text", "Adultos");

    const { data, error } = await regenerate([
      { kind: "inclusion", text: "Adultos" }, // já aceito → dedupe
      { kind: "inclusion", text: "Idosos" }, // novo → entra
    ]);
    expect(error).toBeNull();
    expect(data).toBe(1);

    const rows = await listCriteria();
    expect(rows.map((r) => r.text).sort()).toEqual(["Adultos", "Idosos"]);
    expect(rows.find((r) => r.text === "Adultos")!.ratification_state).toBe("accepted");
  });

  it("recusa quando o protocolo está travado (FR-010/011)", async () => {
    const svc = serviceClient();
    await svc.from("protocol").insert({ review_id: reviewId, state: "locked" });

    const { error } = await regenerate([{ kind: "inclusion", text: "X" }]);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/locked/);
  });

  it("RLS: não-membro não consegue regenerar", async () => {
    const s = Date.now();
    const intruder = (await signUpUser(`rederiv_i_${s}@example.com`, "senha-teste-123"))
      .client;
    const { error } = await intruder.rpc("regenerate_eligibility_criteria", {
      p_review_id: reviewId,
      p_output: OUTPUT,
      p_provenance: PROV,
      p_not_found: false,
      p_items: [{ kind: "inclusion", text: "Y" }],
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx supabase migration up` (aplica migrations existentes) e então
`npm run test -- tests/integration/criteria-rederivation.test.ts --run`
Expected: FALHA — `regenerate_eligibility_criteria` ainda não existe (erro de função
inexistente). *(Se o Supabase local não estiver de pé, suba-o antes: `npx supabase start`.)*

- [ ] **Step 3: Escrever a migration 0011**

Crie `supabase/migrations/0011_regenerate_eligibility_criteria.sql`:

```sql
-- 0011_regenerate_eligibility_criteria.sql
-- Fatia 11 — re-derivação segura de critérios de elegibilidade.
-- RPC autoritativa: recusa se o protocolo travou (a base de elegibilidade só muda
-- por emenda — FR-010/011), registra a sugestão de IA (proveniência preservada),
-- substitui SÓ os critérios de IA ainda pendentes (preserva humanos e ratificados),
-- e insere o lote novo deduplicado por rótulo normalizado contra os sobreviventes.

create or replace function public.regenerate_eligibility_criteria(
  p_review_id  uuid,
  p_output     jsonb,
  p_provenance jsonb,
  p_not_found  boolean,
  p_items      jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_id uuid;
  v_state       protocol_state;
  v_sug         uuid;
  v_count       integer;
begin
  if not public.is_review_member(p_review_id) then
    raise exception 'not a member';
  end if;

  select id into v_question_id
  from public.question
  where review_id = p_review_id;
  if v_question_id is null then
    raise exception 'question not found';
  end if;

  -- Guarda de fase (FR-010): elegibilidade congela quando o protocolo trava.
  select state into v_state
  from public.protocol
  where review_id = p_review_id;
  if v_state = 'locked' then
    raise exception 'protocol is locked; eligibility changes must be amendments';
  end if;

  -- Proveniência da nova sugestão (histórico preservado; não apaga ai_suggestion).
  insert into public.ai_suggestion (
    review_id, target_kind, target_id, output, provenance, state, not_found
  ) values (
    p_review_id, 'eligibility', v_question_id, p_output, p_provenance, 'pending', p_not_found
  )
  returning id into v_sug;

  -- Supersede: remove SÓ as sugestões de IA ainda não ratificadas.
  delete from public.eligibility_criterion
  where review_id = p_review_id
    and origin = 'ai'
    and ratification_state = 'pending';

  -- Insere o lote novo deduplicado por rótulo normalizado:
  --   (a) dentro do próprio lote (distinct on);
  --   (b) contra TODO critério sobrevivente (humano + ratificado) — a IA não
  --       re-propõe o já aceito/editado nem re-empurra o rejeitado.
  insert into public.eligibility_criterion (
    review_id, question_id, kind, text, origin, ratification_state, ai_suggestion_id
  )
  select p_review_id, v_question_id, x.kind, x.text, 'ai', 'pending', v_sug
  from (
    select distinct on (public.normalize_reason_label(text)) kind, text
    from jsonb_to_recordset(p_items) as r(kind criterion_kind, text text)
    where btrim(text) <> ''
    order by public.normalize_reason_label(text)
  ) x
  where public.normalize_reason_label(x.text) not in (
    select public.normalize_reason_label(text)
    from public.eligibility_criterion
    where review_id = p_review_id
  );
  get diagnostics v_count = row_count;

  insert into public.audit_entry (
    review_id, actor_type, actor_id, action, entity, entity_id, before, after
  ) values (
    p_review_id, 'human', auth.uid(), 'derive_criteria', 'ai_suggestion', v_sug,
    null, jsonb_build_object('count', v_count)
  );

  return v_count;
end;
$$;

grant execute on function
  public.regenerate_eligibility_criteria(uuid, jsonb, jsonb, boolean, jsonb)
  to authenticated;
```

- [ ] **Step 4: Aplicar a migration e rodar o teste até passar**

Run: `npx supabase migration up && npm run test -- tests/integration/criteria-rederivation.test.ts --run`
Expected: PASS (5 testes). *(Se preferir recriar o schema do zero: `npx supabase db reset`.)*

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_regenerate_eligibility_criteria.sql tests/integration/criteria-rederivation.test.ts
git commit -m "feat(11): RPC regenerate_eligibility_criteria (supersede + dedupe + guarda de trava)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Helper puro `criteriaItemsFromOutput` + reescrita de `deriveCriteria`

**Files:**
- Create: `src/lib/question/criteria.ts`
- Test: `tests/unit/question/criteria-items.test.ts`
- Modify: `app/reviews/[reviewId]/question/actions.ts` (função `deriveCriteria`, ~linhas 58-133)

- [ ] **Step 1: Escrever o teste unit do helper (falha)**

Crie `tests/unit/question/criteria-items.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { criteriaItemsFromOutput } from "@/lib/question/criteria";

describe("criteriaItemsFromOutput", () => {
  it("achata inclusion/exclusion/searchTerms preservando o kind", () => {
    const items = criteriaItemsFromOutput({
      inclusion: ["A", "B"],
      exclusion: ["C"],
      searchTerms: ["d", "e"],
    });
    expect(items).toEqual([
      { kind: "inclusion", text: "A" },
      { kind: "inclusion", text: "B" },
      { kind: "exclusion", text: "C" },
      { kind: "search_term", text: "d" },
      { kind: "search_term", text: "e" },
    ]);
  });

  it("lida com listas vazias (not_found)", () => {
    expect(
      criteriaItemsFromOutput({ inclusion: [], exclusion: [], searchTerms: [] }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run test -- tests/unit/question/criteria-items.test.ts --run`
Expected: FALHA — módulo `@/lib/question/criteria` inexistente.

- [ ] **Step 3: Criar o helper**

Crie `src/lib/question/criteria.ts`:

```ts
export interface CriterionItem {
  kind: "inclusion" | "exclusion" | "search_term";
  text: string;
}

/**
 * Achata a saída factual do LLM (`deriveEligibility`) em itens `{kind,text}` para a
 * RPC `regenerate_eligibility_criteria`. Função pura — sem I/O, fácil de testar.
 */
export function criteriaItemsFromOutput(output: {
  inclusion: string[];
  exclusion: string[];
  searchTerms: string[];
}): CriterionItem[] {
  return [
    ...output.inclusion.map((text) => ({ kind: "inclusion" as const, text })),
    ...output.exclusion.map((text) => ({ kind: "exclusion" as const, text })),
    ...output.searchTerms.map((text) => ({ kind: "search_term" as const, text })),
  ];
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm run test -- tests/unit/question/criteria-items.test.ts --run`
Expected: PASS (2 testes).

- [ ] **Step 5: Reescrever `deriveCriteria`**

Em `app/reviews/[reviewId]/question/actions.ts`, adicione o import (junto aos demais
imports do topo):

```ts
import { criteriaItemsFromOutput } from "@/lib/question/criteria";
```

Substitua **toda** a função `deriveCriteria` (atualmente ~linhas 58-133) por:

```ts
export async function deriveCriteria(reviewId: string) {
  const { supabase } = await requireMember(reviewId);
  const { data: q } = await supabase
    .from("question")
    .select("id, framework, question_text, fields")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (!q) return { ok: false, error: "Formule a pergunta primeiro." };

  // Pré-checagem de fase: evita gastar a chamada de LLM se o protocolo já travou.
  // A RPC reforça isto de forma autoritativa (defesa em profundidade).
  const { data: protocol } = await supabase
    .from("protocol")
    .select("state")
    .eq("review_id", reviewId)
    .maybeSingle();
  if (protocol?.state === "locked") {
    return {
      ok: false,
      error:
        "Protocolo travado: mudanças de elegibilidade entram como emenda do protocolo.",
    };
  }

  let provider;
  try {
    provider = await getLLMProvider(reviewId);
  } catch (e) {
    if (e instanceof MissingByokError)
      return {
        ok: false,
        error: "Cadastre a chave de IA (BYOK) para usar a derivação.",
      };
    throw e;
  }

  const s = await provider.deriveEligibility({
    framework: q.framework,
    questionText: q.question_text,
    fields: (q.fields ?? {}) as Record<string, unknown>,
  });

  const { data: count, error } = await supabase.rpc(
    "regenerate_eligibility_criteria",
    {
      p_review_id: reviewId,
      p_output: s.output,
      p_provenance: s.provenance,
      p_not_found: s.not_found,
      p_items: criteriaItemsFromOutput(s.output),
    },
  );
  if (error) {
    if (error.message.includes("locked"))
      return {
        ok: false,
        error:
          "Protocolo travado: mudanças de elegibilidade entram como emenda do protocolo.",
      };
    return { ok: false, error: "Falha ao gravar critérios." };
  }

  revalidatePath(`/reviews/${reviewId}/question`);
  return { ok: true as const, notFound: s.not_found, count: count ?? 0 };
}
```

Observações: a inserção de `ai_suggestion`, a inserção dos critérios e o `writeAudit`
manual saíram daqui — agora vivem dentro da RPC (atômico). O import de `writeAudit`
**permanece** (ainda usado por `saveQuestion` e `ratifyCriterion`).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 erros. *(Confirma que `s.output` casa com o parâmetro do helper e que a RPC
é chamada com os tipos certos.)*

- [ ] **Step 7: Commit**

```bash
git add src/lib/question/criteria.ts tests/unit/question/criteria-items.test.ts "app/reviews/[reviewId]/question/actions.ts"
git commit -m "feat(11): deriveCriteria pré-checa trava e chama a RPC de regeração

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `CriteriaPanel` — "Regerar sugestões" + confirmação + guarda de trava (TDD)

**Files:**
- Modify: `src/components/question/CriteriaPanel.tsx`
- Test: `tests/unit/question/criteria-panel.test.tsx` (adiciona testes; os da Fatia 10 ficam)

- [ ] **Step 1: Escrever os testes novos (falham)**

Adicione ao final de `tests/unit/question/criteria-panel.test.tsx` (o `vi.mock` de actions e
o import de `CriteriaPanel`/`render`/`screen`/`vi` já existem no topo do arquivo, da Fatia 10):

```tsx
import { fireEvent } from "@testing-library/react";

const aiCriterion = {
  id: "c1",
  kind: "inclusion" as const,
  text: "Adultos",
  origin: "ai" as const,
  ratification_state: "pending" as const,
  ai_suggestion_id: "s1",
};

describe("CriteriaPanel — Fatia 11: regerar / confirmação / trava", () => {
  it("com critérios de IA presentes, o botão vira 'Regerar sugestões'", () => {
    render(<CriteriaPanel reviewId="r1" criteria={[aiCriterion]} canDerive />);
    expect(
      screen.getByRole("button", { name: "Regerar sugestões" }),
    ).toBeInTheDocument();
  });

  it("regerar pede confirmação; ao cancelar, não chama deriveCriteria", async () => {
    const { deriveCriteria } = await import(
      "../../../app/reviews/[reviewId]/question/actions"
    );
    (deriveCriteria as ReturnType<typeof vi.fn>).mockClear();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<CriteriaPanel reviewId="r1" criteria={[aiCriterion]} canDerive />);
    fireEvent.click(screen.getByRole("button", { name: "Regerar sugestões" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(deriveCriteria).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("travado: botão desabilitado e nota apontando emenda", () => {
    render(
      <CriteriaPanel reviewId="r1" criteria={[aiCriterion]} canDerive locked />,
    );
    expect(
      screen.getByRole("button", { name: "Regerar sugestões" }),
    ).toBeDisabled();
    expect(screen.getByText(/emenda do protocolo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm run test -- tests/unit/question/criteria-panel.test.tsx --run`
Expected: FALHA — hoje o botão é sempre "Derivar por IA", sem confirmação, sem `locked`.

- [ ] **Step 3: Atualizar `CriteriaPanel`**

Em `src/components/question/CriteriaPanel.tsx`:

(a) Acrescente `locked` à assinatura de props (opcional, default `false` — assim os testes
da Fatia 10 que não passam `locked` continuam válidos):

```tsx
export function CriteriaPanel({
  reviewId,
  criteria,
  canDerive,
  locked = false,
}: {
  reviewId: string;
  criteria: CriterionRow[];
  canDerive: boolean;
  locked?: boolean;
}) {
```

(b) Logo após os `useState`, derive se já há sugestões de IA:

```tsx
  const hasAi = criteria.some((c) => c.origin === "ai");
```

(c) Substitua o `<AsyncActionButton ... idleLabel="Derivar por IA" .../>` (da Fatia 10) por:

```tsx
        <AsyncActionButton
          idleLabel={hasAi ? "Regerar sugestões" : "Derivar por IA"}
          pendingLabel={hasAi ? "Regerando…" : "Derivando…"}
          disabled={!canDerive || locked}
          title={
            locked
              ? "Protocolo travado — mudanças de elegibilidade entram como emenda do protocolo"
              : canDerive
                ? ""
                : "Salve a pergunta e cadastre a chave de IA"
          }
          className="btn-primary disabled:opacity-50"
          onRun={async () => {
            if (
              hasAi &&
              !window.confirm(
                "Regerar substitui as sugestões ainda não ratificadas; seus critérios aceitos/editados permanecem. Continuar?",
              )
            )
              return;
            const r = await deriveCriteria(reviewId);
            setNotFound(!!r.ok && !!r.notFound);
            setMsg(
              r.ok ? "Sugestões geradas." : "error" in r ? r.error : "Erro",
            );
          }}
        />
```

(d) Imediatamente **após** o `</div>` que fecha o header (`<div className="flex items-center gap-3">`),
adicione a nota de trava:

```tsx
      {locked && (
        <p className="text-xs text-ink-soft">
          Protocolo travado: mudanças de elegibilidade entram como{" "}
          <a href={`/reviews/${reviewId}/protocol`} className="underline">
            emenda do protocolo
          </a>
          .
        </p>
      )}
```

Não altere a lista de critérios, `SuggestionChip`/`SuggestionActions`, nem `NotFound`.

- [ ] **Step 4: Rodar e confirmar que passa (incl. testes da Fatia 10)**

Run: `npm run test -- tests/unit/question/criteria-panel.test.tsx --run; echo "EXIT=$?"`
Expected: todos PASS (2 da Fatia 10 + 3 novos), EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add src/components/question/CriteriaPanel.tsx tests/unit/question/criteria-panel.test.tsx
git commit -m "feat(11): CriteriaPanel — Regerar com confirmação e guarda de trava

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Página da Pergunta lê o estado do protocolo

**Files:**
- Modify: `app/reviews/[reviewId]/question/page.tsx`

- [ ] **Step 1: Passar `locked` ao `CriteriaPanel`**

Em `app/reviews/[reviewId]/question/page.tsx`:

(a) Adicione o import:

```tsx
import { getProtocol } from "@/lib/protocol/queries";
```

(b) Inclua `getProtocol` no `Promise.all` e capture `protocol`:

```tsx
  const [question, criteria, byok, protocol] = await Promise.all([
    getQuestion(reviewId),
    listCriteria(reviewId),
    getByokStatus(reviewId),
    getProtocol(reviewId),
  ]);
```

(c) Passe `locked` ao `CriteriaPanel`:

```tsx
      <CriteriaPanel
        reviewId={reviewId}
        criteria={criteria}
        canDerive={!!question && byok.present}
        locked={protocol?.state === "locked"}
      />
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: 0 erros. *(`getProtocol` retorna objeto com `.state: 'draft'|'locked'`.)*

- [ ] **Step 3: Commit**

```bash
git add "app/reviews/[reviewId]/question/page.tsx"
git commit -m "feat(11): página da Pergunta lê a trava do protocolo e bloqueia regeração

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Verificação final da fatia (gate de CHECKPOINT 3)

**Files:** nenhum (verificação).

- [ ] **Step 1: Suite unit completa verde**

Run: `npm run test -- tests/unit --run; echo "EXIT=$?"`
Expected: PASS — incluindo `criteria-items` (2) e os novos de `criteria-panel` (3),
**sem regressão** (os da Fatia 10 inclusos). EXIT=0.

- [ ] **Step 2: Integração da Fatia 11 (requer Supabase local)**

Run: `npx supabase migration up && npm run test -- tests/integration/criteria-rederivation.test.ts --run; echo "EXIT=$?"`
Expected: 5 PASS, EXIT=0. *(Se o Supabase local não estiver disponível no ambiente,
**registrar honestamente** que a integração não pôde rodar aqui e que unit/lint/tsc estão
verdes — não alegar verde sem ter rodado.)*

- [ ] **Step 3: Lint limpo**

Run: `npm run lint`
Expected: PASS (0 erros).

- [ ] **Step 4: Type-check limpo**

Run: `npx tsc --noEmit`
Expected: PASS (0 erros).

> **PARAR — CHECKPOINT 3.** Apresentar ao desenvolvedor: branch
> `build/001-marco1-nucleo-fluxo/11-criteria-rederivation-guard`, o diff, e o resultado de
> `tests/unit` + integração (ou a nota de indisponibilidade) + `npm run lint` +
> `npx tsc --noEmit`. **Aguardar o merge manual.** Não iniciar outra fatia.

---

## Self-Review

**1. Cobertura do escopo (slicing §"Fatia 11"):**
- **A-11.1** sinal de fase = `protocol.state='locked'` → RPC (Task 1) + pré-checa (Task 2) + UI (Task 3) + página (Task 4).
- **A-11.2** supersede de `origin='ai' AND pending`, preserva humanos/ratificados → RPC Task 1 `delete`; teste "não dobra" + "preserva ratificados".
- **A-11.3** dedupe por `normalize_reason_label` contra sobreviventes → RPC Task 1 `not in`; teste "não re-propõe o que já foi decidido".
- **A-11.4** guarda autoritativa server-side (RPC) + disable UI → Task 1 (raise) + Task 2 (pré-checa) + Task 3 (`disabled`).
- **A-11.5** pós-trava = bloquear + nota apontando emenda → Task 3 (nota + link para `/protocol`); sem nova UI de emenda.
- Camada 2 (affordance "Regerar" + confirmação) → Task 3.

**2. Varredura de placeholders:** nenhum "TBD/TODO"; todo passo de código mostra o código
completo; comandos com saída esperada.

**3. Consistência de tipos/nomes:** `regenerate_eligibility_criteria(p_review_id, p_output,
p_provenance, p_not_found, p_items)` idêntico entre a migration (Task 1), o teste (Task 1) e
a chamada em `deriveCriteria` (Task 2). `criteriaItemsFromOutput` retorna `{kind,text}[]`
consumido como `p_items`. `CriterionItem.kind` ∈ {inclusion,exclusion,search_term} = enum
`criterion_kind`. Prop `locked?: boolean` consistente entre `CriteriaPanel` (Task 3) e a
página (Task 4). Rótulos "Regerar sugestões"/"Regerando…" consistentes entre componente e
testes.
