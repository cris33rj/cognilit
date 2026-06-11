import { describe, it, expect } from "vitest";
import { MockLLMProvider } from "@/lib/ai/llm/mock";
import type { ExtractionFieldDef } from "@/lib/ai/llm/types";

const fields: ExtractionFieldDef[] = [
  { id: "f-amostra", name: "Amostra", type: "number" },
  { id: "f-ausente", name: "Campo Ausente", type: "text" },
  {
    id: "f-desenho",
    name: "Desenho do estudo",
    type: "select",
    options: ["RCT", "Coorte"],
  },
];

describe("MockLLMProvider.extractFields (FR-012..016)", () => {
  it("proveniência presente em 100% das saídas", async () => {
    const r = await new MockLLMProvider().extractFields({
      fields,
      documentText: "Amostra de 42 participantes. RCT duplo-cego.",
    });
    expect(r.provenance).toHaveProperty("model");
    expect(r.provenance).toHaveProperty("timestamp");
    expect(r.fields).toHaveLength(3);
  });
  it("campo ausente ⇒ value null + reason not_found (FR-013)", async () => {
    const r = await new MockLLMProvider().extractFields({
      fields,
      documentText: "x",
    });
    const ausente = r.fields.find((f) => f.field_id === "f-ausente")!;
    expect(ausente.value.value).toBeNull();
    expect(ausente.value.reason).toBe("not_found");
  });
  it("campo inferido ⇒ inferred=true (FR-014)", async () => {
    const r = await new MockLLMProvider().extractFields({
      fields,
      documentText: "x",
    });
    const desenho = r.fields.find((f) => f.field_id === "f-desenho")!;
    expect(desenho.inferred).toBe(true);
  });
  it("campo ancorado expõe source_span + page (FR-012)", async () => {
    const r = await new MockLLMProvider().extractFields({
      fields,
      documentText: "x",
    });
    const amostra = r.fields.find((f) => f.field_id === "f-amostra")!;
    expect(amostra.value.value).not.toBeNull();
    expect(amostra.grounding.page).not.toBeNull();
    expect(amostra.grounding.source_span).toBeTypeOf("string");
  });
  it("determinístico e sem rede (espelha mock.ts)", async () => {
    const a = await new MockLLMProvider().extractFields({
      fields,
      documentText: "x",
    });
    const b = await new MockLLMProvider().extractFields({
      fields,
      documentText: "x",
    });
    expect(a.fields.map((f) => f.value.value)).toEqual(
      b.fields.map((f) => f.value.value),
    );
  });
});
