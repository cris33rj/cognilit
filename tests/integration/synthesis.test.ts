/**
 * Integration tests — Síntese qualitativa (US1 / SC-008, FR-005a, FR-007)
 *
 * Harness: mirrors extraction-batch.test.ts
 * - serviceClient() (service-role) bypasses RLS → seeds data.
 * - signUpUser() returns an anon client already signed-in as that user.
 * - create_review RPC auto-inserts member row for the calling user → member client.
 * - A second signUpUser = non-member client (never added to the review).
 * - Worker (processSynthesisJob) runs with serviceClient → bypasses RLS (correct for Node worker).
 * - RLS assertions use non-member anon client.
 */
import { describe, it, expect } from "vitest";
import { signUpUser, serviceClient } from "./helpers/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueSynthesisJob } from "@/lib/synthesis/enqueue";
import { processSynthesisJob } from "@/lib/synthesis/batch-worker";
import { MockLLMProvider } from "@/lib/ai/llm/mock";

// ── Seed helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a record (included_ft) in the review with the given title_norm,
 * plus one extraction_field and one ratified extraction_value (state='accepted').
 * Returns { recordId, fieldId, valueId }.
 */
async function seedIncludedRecordWithRatifiedValue(
  svc: SupabaseClient,
  memberClient: SupabaseClient,
  reviewId: string,
  opts: {
    title?: string;
    fieldName?: string;
    state?: "accepted" | "edited";
  } = {},
): Promise<{ recordId: string; fieldId: string; valueId: string }> {
  const title = opts.title ?? "Estudo Síntese";
  const fieldName = opts.fieldName ?? "Amostra";
  const state = opts.state ?? "accepted";

  // Insert record with title_norm so the worker labels it
  const { data: rec, error: rErr } = await svc
    .from("record")
    .insert({
      review_id: reviewId,
      corpus_state: "included_ft",
      source_format: "ris",
      raw: {},
      metadata: { title },
      title_norm: title,
    })
    .select("id")
    .single();
  if (rErr) throw new Error(rErr.message);
  const recordId = rec!.id as string;

  // Ensure extraction form + add field (must be done as member, form is member-owned)
  await memberClient.rpc("ensure_extraction_form", { p_review_id: reviewId });
  const { data: field, error: fErr } = await memberClient.rpc(
    "add_extraction_field",
    {
      p_review_id: reviewId,
      p_name: fieldName,
      p_type: "text",
      p_options: null,
    },
  );
  if (fErr) throw new Error(fErr.message);
  const fieldId = (field as { id: string }).id;

  // Insert extraction_value already ratified (skip pending→ratify RPC to keep seed simple)
  const { data: val, error: vErr } = await svc
    .from("extraction_value")
    .insert({
      review_id: reviewId,
      record_id: recordId,
      field_id: fieldId,
      state,
      final_value: {
        value: `resultado de ${fieldName}`,
        source_span: null,
        page: 1,
      },
    })
    .select("id")
    .single();
  if (vErr) throw new Error(vErr.message);
  const valueId = (val as { id: string }).id;

  return { recordId, fieldId, valueId };
}

// ── 1. RLS isolation (SC-008) ─────────────────────────────────────────────────

describe("RLS — synthesis/theme/theme_finding escopados por membro (SC-008)", () => {
  it("não-membro não lê synthesis/theme/theme_finding e não escreve", async () => {
    const stamp = Date.now();
    const svc = serviceClient();

    // Member A creates the review
    const { client: memberA } = await signUpUser(
      `syn_rls_a_${stamp}@example.com`,
      "senha-teste-123",
    );
    const { data: review, error: rErr } = await memberA.rpc("create_review", {
      p_title: `Síntese RLS ${stamp}`,
    });
    if (rErr) throw rErr;
    const reviewId = (review as { id: string }).id;

    // Seed synthesis + theme via service-role (bypasses RLS — simulates post-worker state)
    const { data: synth, error: synthErr } = await svc
      .from("synthesis")
      .insert({ review_id: reviewId, status: "ready" })
      .select("id")
      .single();
    if (synthErr) throw new Error(synthErr.message);
    const synthesisId = (synth as { id: string }).id;

    // Need a ratified extraction_value to insert theme_finding
    const { valueId } = await seedIncludedRecordWithRatifiedValue(
      svc,
      memberA,
      reviewId,
    );

    const { data: theme, error: tErr } = await svc
      .from("theme")
      .insert({
        review_id: reviewId,
        synthesis_id: synthesisId,
        name: "Tema A",
        narrative: "Narrativa A",
        order: 0,
        state: "pending",
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);
    const themeId = (theme as { id: string }).id;

    await svc.from("theme_finding").insert({
      review_id: reviewId,
      theme_id: themeId,
      extraction_value_id: valueId,
      order: 0,
    });

    // Non-member B — just created, never added to the review
    const { client: nonMember } = await signUpUser(
      `syn_rls_b_${stamp}@example.com`,
      "senha-teste-123",
    );

    // READ — non-member should see nothing
    const { data: leakedSynth } = await nonMember
      .from("synthesis")
      .select("id")
      .eq("review_id", reviewId);
    expect(leakedSynth ?? []).toHaveLength(0);

    const { data: leakedTheme } = await nonMember
      .from("theme")
      .select("id")
      .eq("review_id", reviewId);
    expect(leakedTheme ?? []).toHaveLength(0);

    const { data: leakedTF } = await nonMember
      .from("theme_finding")
      .select("id")
      .eq("review_id", reviewId);
    expect(leakedTF ?? []).toHaveLength(0);

    // WRITE — non-member must be blocked
    const { error: writeErr } = await nonMember.from("synthesis").insert({
      review_id: reviewId,
      status: "draft",
    });
    expect(writeErr).not.toBeNull();

    const { error: themeWriteErr } = await nonMember.from("theme").insert({
      review_id: reviewId,
      synthesis_id: synthesisId,
      name: "Intruso",
      narrative: "",
      order: 99,
      state: "pending",
    });
    expect(themeWriteErr).not.toBeNull();

    // MEMBER can read
    const { data: memberSynth } = await memberA
      .from("synthesis")
      .select("id")
      .eq("review_id", reviewId);
    expect(memberSynth ?? []).toHaveLength(1);

    const { data: memberTheme } = await memberA
      .from("theme")
      .select("id")
      .eq("review_id", reviewId);
    expect(memberTheme ?? []).toHaveLength(1);
  });
});

// ── 2. Regeneration preserves accepted/edited (FR-005a) ───────────────────────

describe("processSynthesisJob — regeneração preserva temas accepted/edited (FR-005a)", () => {
  it("re-rodar não deleta temas accepted nem edited; novos temas chegam como pending", async () => {
    const stamp = Date.now();
    const svc = serviceClient();

    const { client: member } = await signUpUser(
      `syn_regen_${stamp}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await member.rpc("create_review", {
      p_title: `Síntese Regen ${stamp}`,
    });
    const reviewId = (review as { id: string }).id;

    // Seed two included records, each with a ratified value for a DIFFERENT field
    // so MockLLMProvider creates two themes (groups by fieldName)
    await seedIncludedRecordWithRatifiedValue(svc, member, reviewId, {
      title: "Estudo A",
      fieldName: "Campo A",
    });
    await seedIncludedRecordWithRatifiedValue(svc, member, reviewId, {
      title: "Estudo B",
      fieldName: "Campo B",
    });

    // --- Run 1 ---
    const enq1 = await enqueueSynthesisJob({ supabase: member }, reviewId);
    expect(enq1.item_count).toBe(2);

    const res1 = await processSynthesisJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq1.job_id,
    );
    expect(res1.status).toBe("completed");

    // Themes after run 1: both pending
    const { data: themes1 } = await svc
      .from("theme")
      .select("id, name, state")
      .eq("review_id", reviewId)
      .neq("state", "rejected");
    expect(themes1).toHaveLength(2);
    expect(
      themes1!.every((t: { state: string }) => t.state === "pending"),
    ).toBe(true);

    // Mark theme[0] as 'accepted', theme[1] as 'edited' (via member → set_theme_state RPC)
    const themeA = themes1![0]!;
    const themeB = themes1![1]!;

    await member.rpc("set_theme_state", {
      p_theme_id: themeA.id,
      p_state: "accepted",
    });
    await member.rpc("set_theme_state", {
      p_theme_id: themeB.id,
      p_state: "edited",
      p_name: "Campo B editado",
    });

    // --- Run 2 ---
    const enq2 = await enqueueSynthesisJob({ supabase: member }, reviewId);
    const res2 = await processSynthesisJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq2.job_id,
    );
    expect(res2.status).toBe("completed");

    // After run 2: accepted + edited themes must still exist with same ids
    const { data: accepted } = await svc
      .from("theme")
      .select("id, state")
      .eq("id", themeA.id);
    expect(accepted).toHaveLength(1);
    expect(accepted![0]!.state).toBe("accepted");

    const { data: edited } = await svc
      .from("theme")
      .select("id, state")
      .eq("id", themeB.id);
    expect(edited).toHaveLength(1);
    expect(edited![0]!.state).toBe("edited");

    // MockLLMProvider is deterministic: same findings → same field names → same theme names.
    // The second run deletes pending themes (from run 1) and re-inserts them as pending.
    // So total non-rejected themes = 2 accepted/edited + 2 new pending = 4, OR if the
    // same record/field produces the same theme names, still 4 total non-rejected.
    // What matters: the accepted/edited ids are NOT duplicated and still present.
    const { data: allThemes } = await svc
      .from("theme")
      .select("id, state")
      .eq("review_id", reviewId)
      .neq("state", "rejected");

    // accepted + edited themes from run 1 are preserved (their ids still in the list)
    const allIds = (allThemes ?? []).map((t: { id: string }) => t.id);
    expect(allIds).toContain(themeA.id);
    expect(allIds).toContain(themeB.id);

    // No duplication: each id appears exactly once
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);

    // New pending themes from run 2 exist (the worker re-inserts them)
    const newPending = (allThemes ?? []).filter(
      (t: { id: string; state: string }) =>
        t.state === "pending" && t.id !== themeA.id && t.id !== themeB.id,
    );
    expect(newPending.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 3. Grounding obligatory (§II) ────────────────────────────────────────────

describe("processSynthesisJob — grounding obrigatório: todo tema tem ≥1 theme_finding (§II)", () => {
  it("após worker run, cada tema não-rejeitado tem ao menos 1 theme_finding", async () => {
    const stamp = Date.now();
    const svc = serviceClient();

    const { client: member } = await signUpUser(
      `syn_ground_${stamp}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await member.rpc("create_review", {
      p_title: `Síntese Grounding ${stamp}`,
    });
    const reviewId = (review as { id: string }).id;

    // Seed 2 records with different fields → 2 themes, each with its own theme_finding
    await seedIncludedRecordWithRatifiedValue(svc, member, reviewId, {
      title: "G1",
      fieldName: "Campo G1",
    });
    await seedIncludedRecordWithRatifiedValue(svc, member, reviewId, {
      title: "G2",
      fieldName: "Campo G2",
    });

    const enq = await enqueueSynthesisJob({ supabase: member }, reviewId);
    await processSynthesisJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );

    // Fetch all non-rejected themes
    const { data: themes } = await svc
      .from("theme")
      .select("id, state")
      .eq("review_id", reviewId)
      .neq("state", "rejected");
    expect((themes ?? []).length).toBeGreaterThanOrEqual(1);

    // Each theme must have ≥1 theme_finding
    for (const theme of themes ?? []) {
      const { count } = await svc
        .from("theme_finding")
        .select("id", { count: "exact", head: true })
        .eq("theme_id", (theme as { id: string }).id);
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

// ── 4. Insufficient data (FR-007) ────────────────────────────────────────────

describe("processSynthesisJob — dados insuficientes: synthesis fica draft, 0 temas (FR-007)", () => {
  it("review sem extraction_value ratificado: 0 job_items → synthesis.status=draft, 0 temas", async () => {
    const stamp = Date.now();
    const svc = serviceClient();

    const { client: member } = await signUpUser(
      `syn_insuf_${stamp}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await member.rpc("create_review", {
      p_title: `Síntese Insuf ${stamp}`,
    });
    const reviewId = (review as { id: string }).id;

    // Insert an included_ft record WITHOUT any ratified extraction_value
    await svc.from("record").insert({
      review_id: reviewId,
      corpus_state: "included_ft",
      source_format: "ris",
      raw: {},
      metadata: { title: "Sem extração" },
      title_norm: "Sem extração",
    });

    // create_synthesis_job only enqueues records with accepted/edited extraction_value
    const enq = await enqueueSynthesisJob({ supabase: member }, reviewId);
    expect(enq.item_count).toBe(0);

    const res = await processSynthesisJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );
    expect(res.status).toBe("completed");
    expect(res.done).toBe(0);

    // synthesis.status must be 'draft' (no themes fabricated)
    const { data: synth } = await svc
      .from("synthesis")
      .select("status")
      .eq("review_id", reviewId)
      .single();
    expect((synth as { status: string } | null)?.status).toBe("draft");

    // Zero themes created
    const { count } = await svc
      .from("theme")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(0);
  });

  it("review completamente vazio (sem records): 0 job_items → synthesis.status=draft", async () => {
    const stamp = Date.now();
    const svc = serviceClient();

    const { client: member } = await signUpUser(
      `syn_empty_${stamp}@example.com`,
      "senha-teste-123",
    );
    const { data: review } = await member.rpc("create_review", {
      p_title: `Síntese Vazia ${stamp}`,
    });
    const reviewId = (review as { id: string }).id;

    // No records at all
    const enq = await enqueueSynthesisJob({ supabase: member }, reviewId);
    expect(enq.item_count).toBe(0);

    await processSynthesisJob(
      { supabase: svc, provider: new MockLLMProvider() },
      enq.job_id,
    );

    const { data: synth } = await svc
      .from("synthesis")
      .select("status")
      .eq("review_id", reviewId)
      .single();
    expect((synth as { status: string } | null)?.status).toBe("draft");
  });
});
