import { describe, it, expect } from "vitest";
import { mapQueueRow } from "@/lib/screening/queries";

describe("mapQueueRow", () => {
  it("mapeia linha da RPC para o shape de UI, com IA quando presente", () => {
    const row = mapQueueRow({
      record_id: "r1",
      title: "T",
      abstract: "A",
      year: "2020",
      corpus_state: "active",
      ts_decision: null,
      ft_decision: null,
      ft_exclusion_reason_id: null,
      ai_suggestion_id: "s1",
      ai_recommendation: "include",
      ai_confidence: 0.7,
      ai_reason: "razão",
      ai_state: "pending",
      decision_id: "d1",
    });
    expect(row.recordId).toBe("r1");
    expect(row.ai?.recommendation).toBe("include");
    expect(row.ai?.confidence).toBe(0.7);
    expect(row.decisionId).toBe("d1");
  });
  it("ai = null quando não há sugestão; decision_id null quando sem decisão", () => {
    const row = mapQueueRow({
      record_id: "r2",
      title: "T",
      abstract: null,
      year: null,
      corpus_state: "active",
      ts_decision: null,
      ft_decision: null,
      ft_exclusion_reason_id: null,
      ai_suggestion_id: null,
      ai_recommendation: null,
      ai_confidence: null,
      ai_reason: null,
      ai_state: null,
      decision_id: null,
    });
    expect(row.ai).toBeNull();
    expect(row.decisionId).toBeNull();
  });
});
