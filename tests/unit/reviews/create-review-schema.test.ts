import { describe, it, expect } from "vitest";
import { createReviewSchema } from "@/lib/reviews/schema";

describe("createReviewSchema", () => {
  it("rejeita título vazio", () => {
    const result = createReviewSchema.safeParse({ title: "   " });
    expect(result.success).toBe(false);
  });

  it("aceita título válido e faz trim", () => {
    const result = createReviewSchema.safeParse({ title: "  Minha RSL  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Minha RSL");
    }
  });
});
