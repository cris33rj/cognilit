import { describe, it, expect } from "vitest";
import {
  buildMethodsSection,
  buildResultsSection,
  buildAiDeclaration,
  buildDeviations,
  buildOptionalPhasesDeclaration,
  buildDeterministicSections,
} from "@/lib/report/sections";
import type { ReportInputs } from "@/lib/report/types";

const base: ReportInputs = {
  question: {
    framework: "spider",
    questionText: "Qual o impacto de X?",
    fields: { S: "amostra" },
  },
  criteria: [
    { kind: "inclusion", text: "Estudos qualitativos" },
    { kind: "exclusion", text: "Editoriais" },
    { kind: "search_term", text: "X AND Y" },
  ],
  protocol: { state: "locked", lockedAt: "2026-01-10T00:00:00Z" },
  searchQuery: "X AND Y",
  searches: [{ database: "PubMed", recordCount: 120 }],
  counters: {
    identified: 120,
    duplicates: 20,
    screened: 100,
    includedTs: 0,
    excludedTs: 60,
    maybeTs: 0,
    passedTs: 40,
    includedFt: 12,
    excludedFt: 28,
  },
  exclusions: [{ reasonId: "r1", reasonLabel: "Fora do escopo", n: 28 }],
  amendments: [
    { version: 1, datedAt: "2026-02-01", change: { campo: "critério" } },
  ],
  themes: [{ name: "Adesão", narrative: "Os estudos convergem em adesão." }],
  aiSuggestions: [
    {
      targetKind: "screening",
      model: "claude-opus-4-8",
      version: "v1",
      state: "accepted",
    },
    {
      targetKind: "synthesis_theme",
      model: "claude-opus-4-8",
      version: "v1",
      state: "accepted",
    },
  ],
  optionalPhasesOff: [
    { key: "risk_of_bias", label: "Risco de Viés" },
    { key: "certainty", label: "Certeza (CERQual)" },
  ],
};

describe("buildMethodsSection (FR-012, determinístico)", () => {
  it("inclui pergunta, critérios, protocolo travado, busca e fluxo de triagem", () => {
    const md = buildMethodsSection(base);
    expect(md).toContain("Qual o impacto de X?");
    expect(md).toContain("Estudos qualitativos");
    expect(md).toContain("PubMed");
    expect(md).toContain("X AND Y");
    expect(md).toMatch(/120/);
    expect(md).toContain("Risco de Viés");
  });
});

describe("buildResultsSection (A3 — embute síntese, sem LLM)", () => {
  it("embute as contagens e a narrativa de síntese ratificada", () => {
    const md = buildResultsSection(base);
    expect(md).toContain("12");
    expect(md).toContain("Adesão");
    expect(md).toContain("Os estudos convergem em adesão.");
  });
  it("sinaliza síntese ausente sem inventar", () => {
    const md = buildResultsSection({ ...base, themes: [] });
    expect(md.toLowerCase()).toContain("síntese");
  });
});

describe("buildAiDeclaration (FR-013/SC-003)", () => {
  it("enumera 100% das fases com sugestão de IA, com proveniência", () => {
    const md = buildAiDeclaration(base);
    expect(md).toContain("Triagem");
    expect(md).toContain("Síntese");
    expect(md).toContain("claude-opus-4-8");
  });
  it("declara ausência de IA quando não houve sugestões", () => {
    const md = buildAiDeclaration({ ...base, aiSuggestions: [] });
    expect(md.length).toBeGreaterThan(0);
  });
});

describe("buildDeviations (FR-014/SC-004)", () => {
  it("lista emendas datadas pós-travamento", () => {
    const md = buildDeviations(base);
    expect(md).toContain("2026-02-01");
    expect(md).toContain("1");
  });
  it("declara ausência de desvios quando não há emendas", () => {
    const md = buildDeviations({ ...base, amendments: [] });
    expect(md.length).toBeGreaterThan(0);
  });
});

describe("buildOptionalPhasesDeclaration (FR-015/SC-009)", () => {
  it("declara explicitamente as fases opcionais desligadas", () => {
    const md = buildOptionalPhasesDeclaration(base);
    expect(md).toContain("Risco de Viés");
    expect(md).toContain("Certeza");
  });
});

describe("buildDeterministicSections", () => {
  it("retorna methods/results/ai_declaration/deviations em ordem", () => {
    const secs = buildDeterministicSections(base);
    expect(secs.map((s) => s.kind)).toEqual([
      "methods",
      "results",
      "ai_declaration",
      "deviations",
    ]);
    expect(secs.every((s) => s.content.length > 0)).toBe(true);
  });
});
