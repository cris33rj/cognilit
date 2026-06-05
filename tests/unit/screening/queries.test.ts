import { describe, it, expect } from "vitest";
import {
  mapQueueRow,
  mergeUsageCounts,
  mapReasonUsageRow,
} from "@/lib/screening/queries";

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

describe("mergeUsageCounts (8.1)", () => {
  it("atribui a contagem a cada motivo por id; 0 quando ausente", () => {
    const reasons = [
      { id: "a", label: "A", origin: "seed" as const, sourceCriterionId: null },
      {
        id: "b",
        label: "B",
        origin: "manual" as const,
        sourceCriterionId: null,
      },
    ];
    const counts = [{ reasonId: "a", n: 3 }];
    const merged = mergeUsageCounts(reasons, counts);
    expect(merged.find((r) => r.id === "a")!.usageCount).toBe(3);
    expect(merged.find((r) => r.id === "b")!.usageCount).toBe(0);
  });
});

describe("mapReasonUsageRow (8.1)", () => {
  it("mapeia snake_case → camelCase; título nulo vira placeholder", () => {
    expect(
      mapReasonUsageRow({ record_id: "r1", title: "T", decision_id: "d1" }),
    ).toEqual({ recordId: "r1", title: "T", decisionId: "d1" });
    expect(
      mapReasonUsageRow({ record_id: "r2", title: null, decision_id: null }),
    ).toEqual({ recordId: "r2", title: "(sem título)", decisionId: null });
  });
});
