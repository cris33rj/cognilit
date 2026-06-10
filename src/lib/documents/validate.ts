/** Teto de bytes por PDF (50 MiB — A4). Protege o worker e limita custo de OCR. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Teto de páginas por PDF (A4). Aplicado na Fatia 2 (page_count só existe após
 *  abrir o PDF no worker); declarado aqui como contrato único. */
export const MAX_PDF_PAGES = 300;

export type PdfValidation = { ok: true } | { ok: false; error: string };

const HEADER = new TextEncoder().encode("%PDF-");

function startsWithHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < HEADER.length) return false;
  for (let i = 0; i < HEADER.length; i++)
    if (bytes[i] !== HEADER[i]) return false;
  return true;
}

function hasEofTrailer(bytes: Uint8Array): boolean {
  // %%EOF aparece nos últimos ~1KB de um PDF íntegro.
  const tail = bytes.subarray(Math.max(0, bytes.byteLength - 1024));
  return new TextDecoder("latin1").decode(tail).includes("%%EOF");
}

/** Validação SÍNCRONA e leve (sem parsing pesado, §VIII/FR-005): MIME por magic
 *  bytes, tamanho e integridade estrutural básica. Não conta páginas (Fatia 2). */
export function validatePdfUpload(input: {
  bytes: Uint8Array;
  byteSize: number;
}): PdfValidation {
  if (input.byteSize <= 0) return { ok: false, error: "Arquivo vazio." };
  if (input.byteSize > MAX_PDF_BYTES)
    return { ok: false, error: "PDF acima do limite de 50 MB." };
  if (!startsWithHeader(input.bytes))
    return { ok: false, error: "Arquivo não é um PDF válido." };
  if (!hasEofTrailer(input.bytes))
    return { ok: false, error: "PDF corrompido ou incompleto." };
  return { ok: true };
}
