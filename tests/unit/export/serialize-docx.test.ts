import { describe, it, expect } from "vitest";
import { serializeDocx } from "@/lib/export/serialize-docx";
import type { MarkdownInput } from "@/lib/export/queries";

const input: MarkdownInput = {
  reviewTitle: "Minha Revisão",
  sections: [
    { kind: "methods", content: "Texto de métodos." },
    { kind: "results", content: "Texto de resultados." },
  ],
  characteristics: {
    columns: ["Estudo", "Amostra"],
    rows: [
      { recordId: "rec-1", cells: { Estudo: "Silva 2021", Amostra: "120" } },
    ],
  },
  checklist: [
    { itemCode: "1", label: "Título", sectionRef: "Métodos", status: "met" },
  ],
};

describe("serializeDocx", () => {
  it("gera um Buffer DOCX (assinatura ZIP 'PK') não-vazio", async () => {
    const buf = await serializeDocx(input, "Silva, A. (2021). Estudo.", null);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
  });

  it("não falha quando o PNG do fluxograma é null", async () => {
    const buf = await serializeDocx(input, "", null);
    expect(buf.length).toBeGreaterThan(0);
  });
});
