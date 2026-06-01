import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bibtexParser } from "@shared/import/bibtex";

const sample = readFileSync("tests/fixtures/import/sample.bib", "utf8");

describe("bibtexParser", () => {
  it("parseia entradas válidas e mapeia campos canônicos", () => {
    const res = bibtexParser.parse(sample);
    expect(res.format).toBe("bibtex");
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);

    const [a, b] = res.records;

    // primeiro registro
    expect(a!.title).toBe("Aprendizagem ativa em sala");
    expect(a!.authors).toEqual(["Silva, A.", "Souza, B."]);
    expect(a!.year).toBe(2021);
    expect(a!.doi).toBe("10.1000/xyz");
    expect(a!.abstract).toBe("Resumo do artigo sobre aprendizagem.");
    expect(a!.language).toBe("pt");
    // raw preserva campos originais
    expect(a!.raw).toMatchObject({ title: expect.any(String) });

    // segundo registro — campos opcionais ausentes
    // @retorquere/bibtex-parser v10 normalizes titles to sentence-case
    expect(b!.title).toBe("Active learning in higher education");
    expect(b!.authors).toEqual(["Jones, C."]);
    expect(b!.year).toBe(2019);
    expect(b!.doi).toBeNull();
    expect(b!.abstract).toBeNull();
    expect(b!.language).toBeNull();
  });

  it("arquivo vazio ⇒ zero records, erro informativo", () => {
    const res = bibtexParser.parse("");
    expect(res.records).toHaveLength(0);
    expect(res.errors.length).toBeGreaterThanOrEqual(1);
    expect(res.errors[0]!.message).toMatch(/bibtex/i);
  });
});
