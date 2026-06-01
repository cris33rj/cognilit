import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parserFor, parseContent } from "@shared/import/index";
import type { SourceFormat } from "@shared/import/index";

const csvSample = readFileSync("tests/fixtures/import/sample.csv", "utf8");
const risSample = readFileSync("tests/fixtures/import/sample.ris", "utf8");
const bibtexSample = readFileSync("tests/fixtures/import/sample.bib", "utf8");

// ── parserFor ────────────────────────────────────────────────────────────────

describe("parserFor", () => {
  it("retorna o csvParser para 'csv'", () => {
    const p = parserFor("csv");
    expect(p.format).toBe("csv");
  });

  it("retorna o risParser para 'ris'", () => {
    const p = parserFor("ris");
    expect(p.format).toBe("ris");
  });

  it("retorna o bibtexParser para 'bibtex'", () => {
    const p = parserFor("bibtex");
    expect(p.format).toBe("bibtex");
  });

  it("instância retornada tem método parse", () => {
    const formats: SourceFormat[] = ["csv", "ris", "bibtex"];
    for (const fmt of formats) {
      expect(typeof parserFor(fmt).parse).toBe("function");
    }
  });
});

// ── parseContent ─────────────────────────────────────────────────────────────

describe("parseContent", () => {
  it("parseia CSV e retorna registros válidos", () => {
    const result = parseContent("csv", csvSample);
    expect(result.format).toBe("csv");
    expect(result.errors).toHaveLength(0);
    expect(result.records.length).toBeGreaterThan(0);
  });

  it("parseia RIS e retorna registros válidos", () => {
    const result = parseContent("ris", risSample);
    expect(result.format).toBe("ris");
    expect(result.errors).toHaveLength(0);
    expect(result.records.length).toBeGreaterThan(0);
  });

  it("parseia BibTeX e retorna registros válidos", () => {
    const result = parseContent("bibtex", bibtexSample);
    expect(result.format).toBe("bibtex");
    expect(result.errors).toHaveLength(0);
    expect(result.records.length).toBeGreaterThan(0);
  });

  it("repassa opts.fieldMap para o csvParser (FR-014)", () => {
    const custom = 'Título,Ano\n"Teste de fieldMap",2023\n';
    const result = parseContent("csv", custom, {
      fieldMap: { title: "Título", year: "Ano" },
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]!.title).toBe("Teste de fieldMap");
    expect(result.records[0]!.year).toBe(2023);
  });

  it("arquivo malformado ⇒ errors não-vazio, records vazio (FR-016 — RIS)", () => {
    const result = parseContent("ris", "isto nao é RIS válido");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.records).toHaveLength(0);
  });

  it("arquivo malformado ⇒ errors não-vazio, records vazio (FR-016 — BibTeX)", () => {
    const result = parseContent("bibtex", "");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.records).toHaveLength(0);
  });
});

// ── re-exports de tipos ──────────────────────────────────────────────────────

describe("re-exports de tipos (smoke)", () => {
  it("SourceFormat é uma string union utilizável", () => {
    const fmt: SourceFormat = "ris";
    expect(fmt).toBe("ris");
  });
});
