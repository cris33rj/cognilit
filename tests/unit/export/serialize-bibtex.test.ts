import { describe, it, expect } from "vitest";
import { serializeBibtex } from "@/lib/export/serialize-bibtex";
import type { RecordDetailData } from "@/lib/record/queries";

const full: RecordDetailData = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Estudo sobre X",
  authors: ["Silva, Ana", "Souza, João"],
  year: 2021,
  doi: "10.1000/xyz",
  language: "pt",
  abstract: "resumo",
  journal: "Revista Brasileira",
  keywords: ["a", "b"],
  volume: "12",
  issue: "3",
  pages: "45-60",
};

describe("serializeBibtex", () => {
  it("monta uma entrada @article com os campos presentes", () => {
    const out = serializeBibtex([full]);
    expect(out).toContain("@article{");
    expect(out).toContain("title = {Estudo sobre X}");
    expect(out).toContain("author = {Silva, Ana and Souza, João}");
    expect(out).toContain("year = {2021}");
    expect(out).toContain("doi = {10.1000/xyz}");
    expect(out).toContain("journal = {Revista Brasileira}");
    expect(out).toContain("pages = {45-60}");
  });

  it("OMITE campos ausentes (não inventa — §II)", () => {
    const bare: RecordDetailData = {
      id: "22222222-2222-2222-2222-222222222222",
      title: "Sem metadados",
      authors: [],
      year: null,
      doi: null,
      language: null,
      abstract: null,
      journal: null,
      keywords: [],
      volume: null,
      issue: null,
      pages: null,
    };
    const out = serializeBibtex([bare]);
    expect(out).toContain("title = {Sem metadados}");
    expect(out).not.toContain("author =");
    expect(out).not.toContain("year =");
    expect(out).not.toContain("doi =");
  });

  it("cobre todos os registros (FR-021)", () => {
    const out = serializeBibtex([
      full,
      { ...full, id: "33333333-3333-3333-3333-333333333333" },
    ]);
    expect((out.match(/@article\{/g) ?? []).length).toBe(2);
  });
});
