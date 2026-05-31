import { describe, it, expect } from "vitest";
import { questionSchema, FRAMEWORK_FIELDS } from "@/lib/question/schema";

describe("questionSchema", () => {
  it("SPIDER é o default e aceita seus campos", () => {
    const r = questionSchema.safeParse({
      framework: "spider",
      questionText: "Impacto de X?",
      fields: {
        sample: "estudantes",
        phenomenon: "X",
        design: "qualitativo",
        evaluation: "Y",
        researchType: "qual",
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejeita framework inválido", () => {
    const r = questionSchema.safeParse({
      framework: "xyz",
      questionText: "q",
      fields: {},
    });
    expect(r.success).toBe(false);
  });

  it("livre exige apenas questionText", () => {
    const r = questionSchema.safeParse({
      framework: "free",
      questionText: "Pergunta livre",
      fields: {},
    });
    expect(r.success).toBe(true);
  });

  it("define os campos de cada framework", () => {
    expect(FRAMEWORK_FIELDS.spider.length).toBeGreaterThan(0);
    expect(FRAMEWORK_FIELDS.pico).toEqual(
      expect.arrayContaining(["population"]),
    );
  });
});
