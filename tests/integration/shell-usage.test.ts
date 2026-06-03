import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";
import { summarizeUsage, type AiUsageSummary } from "@/lib/shell/usage";

describe("shell — consumo de IA (FR-033)", () => {
  let owner: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;

  beforeAll(async () => {
    const uid = crypto.randomUUID();
    owner = (
      await signUpUser(`usage_owner_${uid}@example.com`, "senha-teste-123")
    ).client;

    // 1. Criar revisão via owner RPC
    const { data: review, error: reviewError } = await owner.rpc(
      "create_review",
      { p_title: "Shell Usage Test" },
    );
    if (reviewError) throw reviewError;
    reviewId = review.id;

    // 2. Inserir dois registros de ai_usage via owner client (owner é membro)
    const { error: insertError } = await owner.from("ai_usage").insert([
      {
        review_id: reviewId,
        phase: "screening",
        tokens_in: 100,
        tokens_out: 50,
        cost: {},
      },
      {
        review_id: reviewId,
        phase: "screening",
        tokens_in: 200,
        tokens_out: 80,
        cost: {},
      },
    ]);
    if (insertError) throw insertError;
  }, 30_000);

  it("summarizeUsage agrega tokens de linhas reais do banco", async () => {
    const { data, error } = await owner
      .from("ai_usage")
      .select("tokens_in, tokens_out")
      .eq("review_id", reviewId);
    expect(error).toBeNull();
    const rows = (data ?? []) as { tokens_in: number; tokens_out: number }[];
    const result: AiUsageSummary = summarizeUsage(rows);
    expect(result).toEqual({ tokensIn: 300, tokensOut: 130 });
  });

  it("summarizeUsage([]) retorna zeros (pura, sem I/O)", () => {
    const result = summarizeUsage([]);
    expect(result).toEqual({ tokensIn: 0, tokensOut: 0 });
  });
}, 60_000);
