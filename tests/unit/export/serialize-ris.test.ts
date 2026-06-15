import { describe, it, expect } from "vitest";
import { serializeRis } from "@/lib/export/serialize-ris";
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
  keywords: [],
  volume: "12",
  issue: "3",
  pages: "45-60",
};

describe("serializeRis", () => {
  it("monta um registro JOUR com tags presentes e termina em ER", () => {
    const out = serializeRis([full]);
    expect(out).toContain("TY  - JOUR");
    expect(out).toContain("TI  - Estudo sobre X");
    expect(out).toContain("AU  - Silva, Ana");
    expect(out).toContain("AU  - Souza, João");
    expect(out).toContain("PY  - 2021");
    expect(out).toContain("DO  - 10.1000/xyz");
    expect(out).toContain("JO  - Revista Brasileira");
    expect(out).toContain("SP  - 45");
    expect(out).toContain("EP  - 60");
    expect(out.trimEnd().endsWith("ER  -")).toBe(true);
  });

  it("OMITE tags de campos ausentes (não inventa — §II)", () => {
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
    const out = serializeRis([bare]);
    expect(out).toContain("TI  - Sem metadados");
    expect(out).not.toContain("AU  -");
    expect(out).not.toContain("PY  -");
  });

  it("cobre todos os registros (FR-021)", () => {
    const out = serializeRis([
      full,
      { ...full, id: "33333333-3333-3333-3333-333333333333" },
    ]);
    expect((out.match(/TY {2}- JOUR/g) ?? []).length).toBe(2);
  });
});
