import { describe, it, expect } from "vitest";
import { buildThemeSummaryTable } from "@/lib/synthesis/summary-table";

const findings = [
  {
    recordId: "r1",
    recordLabel: "Silva 2020",
    fieldName: "Desfecho",
    finalValue: "melhora",
  },
  { recordId: "r1", recordLabel: "Silva 2020", fieldName: "N", finalValue: 30 },
  {
    recordId: "r2",
    recordLabel: "Souza 2021",
    fieldName: "Desfecho",
    finalValue: "sem efeito",
  },
];

describe("buildThemeSummaryTable (A1)", () => {
  it("monta colunas = união de campos, 1 linha por estudo", () => {
    const t = buildThemeSummaryTable(findings);
    expect(t.columns).toEqual(["Desfecho", "N"]);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toEqual({
      recordId: "r1",
      label: "Silva 2020",
      cells: { Desfecho: "melhora", N: 30 },
    });
  });

  it("marca célula ausente como não encontrado (null)", () => {
    const t = buildThemeSummaryTable(findings);
    const souza = t.rows.find((r) => r.recordId === "r2")!;
    expect(souza.cells["N"]).toBeNull();
  });

  it("corpus vazio ⇒ tabela vazia (sem colunas, sem linhas)", () => {
    const t = buildThemeSummaryTable([]);
    expect(t.columns).toEqual([]);
    expect(t.rows).toEqual([]);
  });
});
