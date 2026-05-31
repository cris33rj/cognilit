import { describe, it, expect } from "vitest";
import { buildAuditRow } from "@/lib/audit";

describe("buildAuditRow", () => {
  it("monta a linha append-only com actor humano", () => {
    const row = buildAuditRow({
      reviewId: "r1",
      actorId: "u1",
      action: "save_question",
      entity: "question",
      entityId: "q1",
      before: null,
      after: { framework: "spider" },
    });
    expect(row).toMatchObject({
      review_id: "r1",
      actor_type: "human",
      actor_id: "u1",
      action: "save_question",
      entity: "question",
      entity_id: "q1",
      after: { framework: "spider" },
    });
  });
});
