import { describe, it, expect } from "vitest";
import {
  validatePdfUpload,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
} from "@/lib/documents/validate";

function pdfBytes(body = "1 0 obj<<>>endobj"): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${body}\n%%EOF\n`);
}

describe("validatePdfUpload (FR-003, A4)", () => {
  it("aceita um PDF com header e trailer válidos dentro do limite", () => {
    const bytes = pdfBytes();
    const res = validatePdfUpload({ bytes, byteSize: bytes.byteLength });
    expect(res.ok).toBe(true);
  });

  it("rejeita arquivo sem header %PDF-", () => {
    const bytes = new TextEncoder().encode("not a pdf\n%%EOF");
    const res = validatePdfUpload({ bytes, byteSize: bytes.byteLength });
    expect(res.ok).toBe(false);
  });

  it("rejeita arquivo truncado (sem %%EOF)", () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj");
    const res = validatePdfUpload({ bytes, byteSize: bytes.byteLength });
    expect(res.ok).toBe(false);
  });

  it("rejeita arquivo acima do teto de 50 MiB", () => {
    const bytes = pdfBytes();
    const res = validatePdfUpload({ bytes, byteSize: MAX_PDF_BYTES + 1 });
    expect(res.ok).toBe(false);
  });

  it("expõe o teto de páginas para a Fatia 2", () => {
    expect(MAX_PDF_PAGES).toBe(300);
  });
});
