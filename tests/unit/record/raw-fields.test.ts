import { describe, it, expect } from "vitest";
import { extractRawFields } from "@/lib/record/raw-fields";

describe("extractRawFields — RIS", () => {
  it("extrai JO/KW/VL/IS e combina SP–EP", () => {
    const out = extractRawFields("ris", {
      JO: "Journal of Wearable Tech",
      KW: ["edge AI", "wearables"],
      VL: "12",
      IS: "3",
      SP: "45",
      EP: "60",
    });
    expect(out.journal).toBe("Journal of Wearable Tech");
    expect(out.keywords).toEqual(["edge AI", "wearables"]);
    expect(out.volume).toBe("12");
    expect(out.issue).toBe("3");
    expect(out.pages).toBe("45–60");
  });

  it("KW único (string, não array) vira lista de um; JF é fallback de periódico", () => {
    const out = extractRawFields("ris", { JF: "Rev. X", KW: "único" });
    expect(out.journal).toBe("Rev. X");
    expect(out.keywords).toEqual(["único"]);
  });

  it("campos ausentes ⇒ nulos / lista vazia", () => {
    const out = extractRawFields("ris", { TI: "x" });
    expect(out).toEqual({
      journal: null,
      keywords: [],
      volume: null,
      issue: null,
      pages: null,
    });
  });
});

describe("extractRawFields — BibTeX", () => {
  it("journal + keywords (split por ; ou ,) + number como issue", () => {
    const out = extractRawFields("bibtex", {
      journal: "Computers & Education",
      keywords: "edtech; inclusão, ensino",
      volume: "5",
      number: "2",
      pages: "10-20",
    });
    expect(out.journal).toBe("Computers & Education");
    expect(out.keywords).toEqual(["edtech", "inclusão", "ensino"]);
    expect(out.issue).toBe("2");
    expect(out.pages).toBe("10-20");
  });
});

describe("extractRawFields — CSV", () => {
  it("cabeçalho case-insensitive (Journal/Keywords/Volume)", () => {
    const out = extractRawFields("csv", {
      Title: "x",
      Journal: "Nature",
      Keywords: "a; b",
      Volume: "1",
    });
    expect(out.journal).toBe("Nature");
    expect(out.keywords).toEqual(["a", "b"]);
    expect(out.volume).toBe("1");
  });
});

describe("extractRawFields — robustez", () => {
  it("raw não-objeto ⇒ tudo vazio sem lançar", () => {
    expect(extractRawFields("ris", null)).toEqual({
      journal: null,
      keywords: [],
      volume: null,
      issue: null,
      pages: null,
    });
  });
});
