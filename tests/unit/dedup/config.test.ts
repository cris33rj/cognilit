import { describe, it, expect } from "vitest";
import { DEDUP_FUZZY_HIGH } from "@/lib/dedup/config";

describe("dedup config (R2)", () => {
  it("limiar forte fuzzy é 0.92", () => {
    expect(DEDUP_FUZZY_HIGH).toBe(0.92);
  });
});
