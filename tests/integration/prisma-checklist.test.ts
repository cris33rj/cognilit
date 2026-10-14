// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signUpUser, serviceClient } from "./helpers/supabase";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import { enqueueReportDraftJob } from "@/lib/report/enqueue";
import { runReportDraftWorkerWith } from "@/lib/report/batch-run";
import { regenerateDeterministicSections } from "@/lib/report/regenerate";
import { loadPrismaChecklist } from "@/lib/prisma/checklist";

async function seedReview(
  label: string,
): Promise<{ svc: SupabaseClient; member: SupabaseClient; reviewId: string }> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const svc = serviceClient();
  const { client: member } = await signUpUser(
    `checklist_${label}_${stamp}@example.com`,
    "senha-teste-123",
  );
  const { data: review, error } = await member.rpc("create_review", {
    p_title: `Checklist ${label} ${stamp}`,
  });
  if (error) throw new Error(error.message);
  return { svc, member, reviewId: (review as { id: string }).id };
}

describe("Fatia 4 — checklist PRISMA (0020)", () => {
  it("a geracao do relatorio grava o snapshot com 27 itens", async () => {
    const { svc, member, reviewId } = await seedReview("gen");
    await enqueueReportDraftJob({ supabase: member }, reviewId); // RPC gated -> member client
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId); // worker -> service client

    const { count } = await svc
      .from("prisma_checklist_item")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(27);

    const items = await loadPrismaChecklist({ supabase: svc }, reviewId);
    // Fases opcionais OFF → not_applicable (D19).
    expect(items.find((i) => i.itemCode === "11")?.status).toBe(
      "not_applicable",
    );
    expect(items.find((i) => i.itemCode === "22")?.status).toBe(
      "not_applicable",
    );
    // Métodos é montado deterministicamente → item 5 atendido.
    expect(items.find((i) => i.itemCode === "5")?.status).toBe("met");
    // Item não gerado pelo sistema → pendente (US4.3).
    expect(items.find((i) => i.itemCode === "1")?.status).toBe("pending");
  });

  it("a regeneracao re-grava o snapshot (idempotente, 27 itens)", async () => {
    const { svc, member, reviewId } = await seedReview("regen");
    await enqueueReportDraftJob({ supabase: member }, reviewId); // RPC gated -> member client
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);
    await regenerateDeterministicSections({ supabase: member }, reviewId);

    const { count } = await svc
      .from("prisma_checklist_item")
      .select("id", { count: "exact", head: true })
      .eq("review_id", reviewId);
    expect(count).toBe(27); // upsert por (review_id,item_code) — não duplica
  });

  it("RLS: nao-membro nao le o snapshot de outra Revisao", async () => {
    const { svc, member, reviewId } = await seedReview("rls");
    await enqueueReportDraftJob({ supabase: member }, reviewId); // RPC gated -> member client
    await runReportDraftWorkerWith(svc, new MockLLMProvider(), reviewId);

    const { client: outsider } = await signUpUser(
      `outsider_${Date.now()}@example.com`,
      "senha-teste-123",
    );
    const { data } = await outsider
      .from("prisma_checklist_item")
      .select("id")
      .eq("review_id", reviewId);
    expect(data ?? []).toHaveLength(0);
  });
});
