import { describe, it, expect } from "vitest";
import { composeSuggestedQuery } from "@/lib/search/suggest";

describe("composeSuggestedQuery", () => {
  it("une termos com ' OR '", () => {
    expect(
      composeSuggestedQuery(["active learning", "flipped classroom"]),
    ).toBe("active learning OR flipped classroom");
  });

  it("faz trim, descarta vazios e deduplica preservando a ordem", () => {
    expect(
      composeSuggestedQuery(["  a ", "", "b", "a", "   ", "b"]),
    ).toBe("a OR b");
  });

  it("retorna string vazia quando não há termos úteis", () => {
    expect(composeSuggestedQuery([])).toBe("");
    expect(composeSuggestedQuery(["", "   "])).toBe("");
  });

  it("um único termo não ganha separador", () => {
    expect(composeSuggestedQuery(["active learning"])).toBe("active learning");
  });
});
