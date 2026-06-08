import { describe, it, expect } from "vitest";
import { toSearchSummaries } from "@/lib/search/queries";

describe("toSearchSummaries", () => {
  it("mapeia campos e extrai a contagem de record(count)", () => {
    const out = toSearchSummaries([
      {
        id: "s1",
        database: "ERIC",
        created_at: "2026-05-30T10:00:00Z",
        record: [{ count: 12 }],
      },
    ]);
    expect(out).toEqual([
      {
        id: "s1",
        database: "ERIC",
        createdAt: "2026-05-30T10:00:00Z",
        recordCount: 12,
      },
    ]);
  });

  it("trata record vazio ou nulo como contagem 0", () => {
    const out = toSearchSummaries([
      { id: "a", database: "PubMed", created_at: "2026-01-01T00:00:00Z", record: [] },
      { id: "b", database: "Scopus", created_at: "2026-01-02T00:00:00Z", record: null },
    ]);
    expect(out.map((s) => s.recordCount)).toEqual([0, 0]);
  });

  it("preserva a ordem das linhas recebidas", () => {
    const out = toSearchSummaries([
      { id: "x", database: "A", created_at: "2026-01-03T00:00:00Z", record: [{ count: 1 }] },
      { id: "y", database: "B", created_at: "2026-01-02T00:00:00Z", record: [{ count: 2 }] },
    ]);
    expect(out.map((s) => s.id)).toEqual(["x", "y"]);
  });
});
