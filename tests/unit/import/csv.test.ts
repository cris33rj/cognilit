import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { csvParser } from "@shared/import/csv";

const sample = readFileSync("tests/fixtures/import/sample.csv", "utf8");

describe("csvParser", () => {
  it("parseia linhas válidas com cabeçalho padrão", () => {
    const res = csvParser.parse(sample);
    expect(res.errors).toHaveLength(0);
    expect(res.records).toHaveLength(2);
    const [a, b] = res.records;
    expect(a!.title).toBe("Aprendizagem ativa em sala");
    expect(a!.authors).toEqual(["Silva, A.", "Souza, B."]);
    expect(a!.year).toBe(2021);
    expect(a!.doi).toBe("10.1000/abc");
    expect(a!.language).toBe("pt");
    expect(b!.doi).toBeNull();
  });

  it("aceita fieldMap para colunas não-padrão (FR-014)", () => {
    const custom = 'Título,Ano\n"X",2020\n';
    const res = csvParser.parse(custom, {
      fieldMap: { title: "Título", year: "Ano" },
    });
    expect(res.records).toHaveLength(1);
    expect(res.records[0]!.title).toBe("X");
    expect(res.records[0]!.year).toBe(2020);
  });

  it("conteúdo sem linhas de dados ⇒ zero records", () => {
    const res = csvParser.parse("title,year\n");
    expect(res.records).toHaveLength(0);
  });
});
