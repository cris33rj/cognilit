// @vitest-environment node
import { describe, it, expect } from "vitest";
import { assembleCharacteristics } from "@/lib/prisma/characteristics";

const fields = [
  { id: "f1", name: "Ano" },
  { id: "f2", name: "Amostra" },
];
const studies = [
  { id: "s1", title: "Estudo A" },
  { id: "s2", title: "Estudo B" },
];
const values = [
  { recordId: "s1", fieldId: "f1", finalValue: 2020 },
  { recordId: "s1", fieldId: "f2", finalValue: "120 pacientes" },
  { recordId: "s2", fieldId: "f1", finalValue: 2021 },
  // s2/f2 ausente de propósito
];

describe("assembleCharacteristics", () => {
  it("colunas = título + campos; 1 linha por estudo", () => {
    const t = assembleCharacteristics(fields, studies, values);
    expect(t.columns).toEqual(["Estudo", "Ano", "Amostra"]);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]!.recordId).toBe("s1");
  });

  it("preenche células ratificadas e deixa null nas ausentes", () => {
    const t = assembleCharacteristics(fields, studies, values);
    expect(t.rows[0]!.cells).toEqual({
      Estudo: "Estudo A",
      Ano: 2020,
      Amostra: "120 pacientes",
    });
    expect(t.rows[1]!.cells).toEqual({
      Estudo: "Estudo B",
      Ano: 2021,
      Amostra: null,
    });
  });

  it("tabela vazia quando não há estudos", () => {
    const t = assembleCharacteristics(fields, [], []);
    expect(t.rows).toHaveLength(0);
    expect(t.columns).toEqual(["Estudo", "Ano", "Amostra"]);
  });
});
