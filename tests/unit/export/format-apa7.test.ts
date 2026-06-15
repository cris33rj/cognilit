import { describe, it, expect } from "vitest";
import { recordToCslJson, formatCitationsApa7 } from "@/lib/export/format-apa7";
import type { RecordDetailData } from "@/lib/record/queries";

const FIXED_ID = "11111111-2222-3333-4444-555555555555";

function rec(over: Partial<RecordDetailData>): RecordDetailData {
  return {
    id: FIXED_ID,
    title: "Aprendizagem ativa em revisões sistemáticas",
    authors: ["Silva, Ana", "Souza, Bruno"],
    year: 2021,
    journal: "Revista de Métodos",
    volume: "12",
    issue: "3",
    pages: "45-60",
    doi: "10.1000/xyz123",
    language: null,
    abstract: null,
    keywords: [],
    ...over,
  };
}

describe("recordToCslJson", () => {
  it("mapeia autores 'Sobrenome, Nome' para family/given", () => {
    const r = rec({});
    const csl = recordToCslJson(r);
    expect(csl.author).toEqual([
      { family: "Silva", given: "Ana" },
      { family: "Souza", given: "Bruno" },
    ]);
    expect(csl.issued).toEqual({ "date-parts": [[2021]] });
    expect(csl.DOI).toBe("10.1000/xyz123");
    expect(csl.id).toBe(r.id);
  });

  it("omite issued quando não há ano (sem inventar)", () => {
    const csl = recordToCslJson(rec({ year: null }));
    expect(csl.issued).toBeUndefined();
  });
});

describe("formatCitationsApa7", () => {
  it("formata uma lista de referências determinística e ordenada por autor", () => {
    const out = formatCitationsApa7([
      rec({
        id: "aaaaaaaa-0000-0000-0000-000000000001",
        authors: ["Souza, Bruno"],
        title: "B-estudo",
        year: 2020,
      }),
      rec({
        id: "aaaaaaaa-0000-0000-0000-000000000002",
        authors: ["Alves, Carla"],
        title: "A-estudo",
        year: 2019,
      }),
    ]);
    expect(out.indexOf("Alves")).toBeLessThan(out.indexOf("Souza"));
    expect(out).toContain("(2019)");
    expect(out).toContain("(2020)");
  });

  it("marca data ausente como (s.d.) — convenção APA pt-BR, não inventa", () => {
    const out = formatCitationsApa7([rec({ year: null })]);
    expect(out).toMatch(/\(s\.?d\.?\)/i);
  });

  it("marca autor ausente sem inventar", () => {
    const out = formatCitationsApa7([rec({ authors: [] })]);
    expect(out).toContain("[autor não informado]");
  });
});
