import { describe, it, expect } from "vitest";
import { toRecordDetail, type RawRecordRow } from "@/lib/record/queries";

describe("toRecordDetail", () => {
  it("funde metadata normalizado + extração do raw", () => {
    const row: RawRecordRow = {
      id: "r1",
      source_format: "ris",
      metadata: {
        title: "Edge AI",
        authors: ["Smith, J."],
        year: 2021,
        doi: "10.1/x",
        abstract: "Resumo.",
        language: "en",
      },
      raw: { JO: "J. Wear", KW: ["edge AI"] },
    };
    const d = toRecordDetail(row);
    expect(d.title).toBe("Edge AI");
    expect(d.authors).toEqual(["Smith, J."]);
    expect(d.year).toBe(2021);
    expect(d.journal).toBe("J. Wear");
    expect(d.keywords).toEqual(["edge AI"]);
  });

  it("metadata/raw ausentes ⇒ defaults seguros", () => {
    const d = toRecordDetail({
      id: "r2",
      source_format: "csv",
      metadata: null,
      raw: null,
    });
    expect(d.title).toBe("(sem título)");
    expect(d.authors).toEqual([]);
    expect(d.journal).toBeNull();
    expect(d.keywords).toEqual([]);
  });
});
