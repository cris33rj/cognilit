import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { risParser } from "@shared/import/ris";

const sample = readFileSync("tests/fixtures/import/sample.ris", "utf8");
const malformed = readFileSync("tests/fixtures/import/malformed.ris", "utf8");

describe("risParser", () => {
  it("parseia dois registros, mapeando tags primárias e alternativas", () => {
    const res = risParser.parse(sample);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    const [a, b] = res.records;
    expect(a!.title).toBe("Aprendizagem ativa em sala");
    expect(a!.authors).toEqual(["Silva, A.", "Souza, B."]);
    expect(a!.year).toBe(2021);
    expect(a!.doi).toBe("10.1000/abc");
    expect(a!.abstract).toBe("Resumo um.");
    expect(b!.title).toBe("Active learning review"); // T1
    expect(b!.authors).toEqual(["Doe, J."]); // A1
    expect(b!.year).toBe(2019); // Y1 com sufixo ///
  });

  it("arquivo sem tags/ER ⇒ zero records e erro claro (FR-016)", () => {
    const res = risParser.parse(malformed);
    expect(res.records).toHaveLength(0);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]!.message).toMatch(/RIS/i);
  });
});
