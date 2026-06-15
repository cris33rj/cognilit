import { describe, it, expect } from "vitest";
import { serializeMarkdown } from "@/lib/export/serialize-markdown";
import type { MarkdownInput } from "@/lib/export/queries";

const input: MarkdownInput = {
  reviewTitle: "Minha Revisão",
  sections: [
    { kind: "methods", content: "Texto dos métodos." },
    { kind: "results", content: "Texto dos resultados." },
  ],
  characteristics: {
    columns: ["Estudo", "País"],
    rows: [{ recordId: "r1", cells: { Estudo: "Silva 2021", País: "Brasil" } }],
  },
  checklist: [
    { itemCode: "1", label: "Título", sectionRef: "methods", status: "met" },
    {
      itemCode: "13",
      label: "Viés",
      sectionRef: null,
      status: "not_applicable",
    },
  ],
};

describe("serializeMarkdown", () => {
  it("começa com o título da revisão como H1", () => {
    expect(serializeMarkdown(input).startsWith("# Minha Revisão")).toBe(true);
  });

  it("inclui as seções com cabeçalhos em pt-BR e na ordem recebida", () => {
    const out = serializeMarkdown(input);
    expect(out).toContain("## Métodos");
    expect(out).toContain("Texto dos métodos.");
    expect(out.indexOf("## Métodos")).toBeLessThan(
      out.indexOf("## Resultados"),
    );
  });

  it("embute a tabela de características (FR-020)", () => {
    const out = serializeMarkdown(input);
    expect(out).toContain("## Tabela de características dos estudos");
    expect(out).toContain("| Estudo | País |");
    expect(out).toContain("| Silva 2021 | Brasil |");
  });

  it("embute o checklist PRISMA com status traduzido", () => {
    const out = serializeMarkdown(input);
    expect(out).toContain("## Checklist PRISMA 2020");
    expect(out).toContain("Título");
    expect(out).toContain("Atendido");
    expect(out).toContain("Não aplicável");
  });
});
