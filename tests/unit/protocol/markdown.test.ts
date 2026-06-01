import { describe, it, expect } from "vitest";
import { protocolToMarkdown } from "@/lib/protocol/markdown";

describe("protocolToMarkdown", () => {
  it("usa contentMarkdown quando presente", () => {
    const md = protocolToMarkdown({ contentMarkdown: "# Título\n\ncorpo" });
    expect(md).toContain("# Título");
  });

  it("serializa um content estruturado em seções", () => {
    const md = protocolToMarkdown({
      sections: { objetivo: "X", criterios: "Y" },
    });
    expect(md).toContain("## objetivo");
    expect(md).toContain("X");
  });

  it("content vazio gera um cabeçalho mínimo", () => {
    const md = protocolToMarkdown({});
    expect(md).toMatch(/Protocolo/);
  });
});
