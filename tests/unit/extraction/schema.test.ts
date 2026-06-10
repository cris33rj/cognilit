import { describe, it, expect } from "vitest";
import { extractionFieldInputSchema } from "@/lib/extraction/schema";

describe("extractionFieldInputSchema", () => {
  it("aceita um campo text válido", () => {
    const r = extractionFieldInputSchema.safeParse({
      name: "Ano",
      type: "text",
    });
    expect(r.success).toBe(true);
  });

  it("rejeita name vazio", () => {
    const r = extractionFieldInputSchema.safeParse({
      name: "  ",
      type: "text",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita select sem options", () => {
    const r = extractionFieldInputSchema.safeParse({
      name: "Desenho",
      type: "select",
    });
    expect(r.success).toBe(false);
  });

  it("rejeita select com options vazio", () => {
    const r = extractionFieldInputSchema.safeParse({
      name: "Desenho",
      type: "select",
      options: [],
    });
    expect(r.success).toBe(false);
  });

  it("aceita select com options", () => {
    const r = extractionFieldInputSchema.safeParse({
      name: "Desenho",
      type: "select",
      options: ["RCT", "Coorte"],
    });
    expect(r.success).toBe(true);
  });

  it("rejeita tipo desconhecido", () => {
    const r = extractionFieldInputSchema.safeParse({
      name: "X",
      type: "currency",
    });
    expect(r.success).toBe(false);
  });
});
