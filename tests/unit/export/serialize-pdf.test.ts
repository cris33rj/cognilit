import { describe, it, expect } from "vitest";
import { serializePdf } from "@/lib/export/serialize-pdf";
import type { MarkdownInput } from "@/lib/export/queries";

const input: MarkdownInput = {
  reviewTitle: "Minha Revisão",
  sections: [{ kind: "methods", content: "Texto de métodos." }],
  characteristics: {
    columns: ["Estudo"],
    rows: [{ recordId: "rec-1", cells: { Estudo: "Silva 2021" } }],
  },
  checklist: [
    {
      itemCode: "1",
      label: "Título",
      sectionRef: "Métodos",
      status: "met",
    },
  ],
};

describe("serializePdf", () => {
  it("gera um Buffer PDF (assinatura '%PDF-') não-vazio", async () => {
    const buf = await serializePdf(input, "Silva, A. (2021). Estudo.", null);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
