import { describe, it, expect } from "vitest";
import { normalizeDoi, normalizeTitle } from "@shared/import/normalize";

describe("normalizeDoi", () => {
  it("remove o prefixo de URL e baixa a caixa", () => {
    expect(normalizeDoi("https://doi.org/10.1000/ABC.123")).toBe(
      "10.1000/abc.123",
    );
  });
  it("aceita DOI cru", () => {
    expect(normalizeDoi("10.1/X")).toBe("10.1/x");
  });
  it("retorna null para vazio/nulo", () => {
    expect(normalizeDoi("")).toBeNull();
    expect(normalizeDoi(null)).toBeNull();
  });
});

describe("normalizeTitle", () => {
  it("baixa caixa, remove pontuação e colapsa espaços", () => {
    expect(normalizeTitle("  A  Study, of   Things! ")).toBe(
      "a study of things",
    );
  });
  it("retorna null para vazio", () => {
    expect(normalizeTitle("   ")).toBeNull();
  });
});
