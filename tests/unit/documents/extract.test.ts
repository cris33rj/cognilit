import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractNativeText, isScannedPage } from "@/lib/documents/extract";

describe("isScannedPage — limiar de densidade (A1/D31)", () => {
  it("página vazia/curta é tratada como escaneada", () => {
    expect(isScannedPage("", 30)).toBe(true);
    expect(isScannedPage("   \n  ", 30)).toBe(true);
    expect(isScannedPage("ab cd", 30)).toBe(true);
  });
  it("página com texto denso é nativa", () => {
    const dense = "palavra ".repeat(50);
    expect(isScannedPage(dense, 30)).toBe(false);
  });
  it("limiar exato: 29 chars não-brancos → escaneada; 30 → nativa", () => {
    expect(isScannedPage("x".repeat(29), 30)).toBe(true);
    expect(isScannedPage("x".repeat(30), 30)).toBe(false);
  });
});

describe("extractNativeText — por página (R1)", () => {
  it("extrai páginas do PDF nativo de fixture com conteúdo 1-based", async () => {
    const bytes = new Uint8Array(
      readFileSync(join(process.cwd(), "tests/fixtures/sample.pdf")),
    );
    const { totalPages, pages } = await extractNativeText(bytes);
    expect(totalPages).toBeGreaterThanOrEqual(1);
    expect(pages.length).toBe(totalPages);
    expect(pages[0]!.page).toBe(1);
    expect(typeof pages[0]!.content).toBe("string");
    expect(pages[0]!.content.length).toBeGreaterThan(0);
  });
});
