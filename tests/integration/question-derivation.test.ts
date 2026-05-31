// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { signUpUser } from "./helpers/supabase";
import { AnthropicProvider } from "@/lib/ai/llm/anthropic";

const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
const QUESTION =
  "Qual o impacto do uso de jogos digitais na motivação de estudantes do ensino fundamental?";

describe("derivação de critérios — API Anthropic real + persistência pending (US5)", () => {
  let client: Awaited<ReturnType<typeof signUpUser>>["client"];
  let reviewId: string;
  let questionId: string;

  beforeAll(async () => {
    // Decisão do usuário: SEM chave o teste FALHA (não faz skip).
    expect(
      apiKey,
      "ANTHROPIC_API_KEY ausente no ambiente de teste — necessário para o teste de API real",
    ).toBeTruthy();

    const stamp = Date.now();
    const u = await signUpUser(`q_${stamp}@example.com`, "senha-teste-123");
    client = u.client;
    const { data: r } = await client.rpc("create_review", {
      p_title: "R Pergunta",
    });
    reviewId = r.id;
    const { data: q } = await client
      .from("question")
      .insert({
        review_id: reviewId,
        framework: "spider",
        question_text: QUESTION,
      })
      .select("id")
      .single();
    questionId = q!.id;
  });

  it("deriveEligibility (Anthropic real) retorna provenance e persiste critérios pending (origin=ai)", async () => {
    const provider = new AnthropicProvider(apiKey);
    const s = await provider.deriveEligibility({
      framework: "spider",
      questionText: QUESTION,
      fields: {},
    });

    // proveniência obrigatória, real (FR-031, §II)
    expect(s.provenance.model).toBeTruthy();
    expect(s.provenance.version).toBeTruthy();
    expect(s.provenance.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(s.state).toBe("pending");
    expect(Array.isArray(s.output.inclusion)).toBe(true);
    expect(Array.isArray(s.output.exclusion)).toBe(true);
    expect(Array.isArray(s.output.searchTerms)).toBe(true);

    const { data: sug } = await client
      .from("ai_suggestion")
      .insert({
        review_id: reviewId,
        target_kind: "eligibility",
        target_id: questionId,
        output: s.output,
        provenance: s.provenance,
        state: "pending",
        not_found: s.not_found,
      })
      .select("id")
      .single();
    expect(sug!.id).toBeTruthy();

    const rows = [
      ...s.output.inclusion.map((t) => ({
        kind: "inclusion" as const,
        text: t,
      })),
      ...s.output.exclusion.map((t) => ({
        kind: "exclusion" as const,
        text: t,
      })),
      ...s.output.searchTerms.map((t) => ({
        kind: "search_term" as const,
        text: t,
      })),
    ].filter((r) => typeof r.text === "string" && r.text.trim() !== "");

    // Pergunta bem-formada ⇒ a API real deve produzir ao menos 1 critério/termo.
    expect(rows.length).toBeGreaterThan(0);

    const { error: insErr } = await client.from("eligibility_criterion").insert(
      rows.map((r) => ({
        review_id: reviewId,
        question_id: questionId,
        kind: r.kind,
        text: r.text,
        origin: "ai" as const,
        ratification_state: "pending" as const,
        ai_suggestion_id: sug!.id,
      })),
    );
    expect(insErr).toBeNull();

    const { data: crit } = await client
      .from("eligibility_criterion")
      .select("ratification_state, origin")
      .eq("review_id", reviewId);
    expect(crit!.length).toBeGreaterThan(0);
    expect(
      crit!.every(
        (c) => c.ratification_state === "pending" && c.origin === "ai",
      ),
    ).toBe(true);
  }, 60000); // a chamada à API real pode levar alguns segundos

  it("constraint barra critério origin=ai sem ai_suggestion_id", async () => {
    const { error } = await client.from("eligibility_criterion").insert({
      review_id: reviewId,
      question_id: questionId,
      kind: "inclusion",
      text: "sem sugestão",
      origin: "ai",
      ratification_state: "pending",
      ai_suggestion_id: null,
    });
    expect(error).not.toBeNull();
  });
});
