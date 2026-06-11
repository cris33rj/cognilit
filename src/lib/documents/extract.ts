import { extractText, getDocumentProxy } from "unpdf";

export interface PageText {
  page: number; // 1-based
  content: string;
}

export interface NativeExtraction {
  totalPages: number;
  pages: PageText[];
}

/**
 * Limiar default de caracteres não-brancos por página abaixo do qual a página é
 * considerada "escaneada" (sem camada de texto útil) e vai para OCR (R2/A1).
 * CALIBRAR contra PDFs reais do corpus-alvo (D31) — ajustável sem mudar schema.
 */
export const DEFAULT_SCAN_THRESHOLD = 30;

export function isScannedPage(
  content: string,
  threshold = DEFAULT_SCAN_THRESHOLD,
): boolean {
  const meaningful = content.replace(/\s+/g, "").length;
  return meaningful < threshold;
}

/**
 * Extração nativa determinística por página (R1, FR-007). Roda no worker (§VIII).
 *
 * @throws Propaga erros de `unpdf` (e.g. PDF corrompido, criptografado ou truncado)
 *   sem capturá-los. O chamador — o pipeline worker (Task 5) — é responsável por
 *   capturar e converter em falha por-item (`document.failed`). Isso é intencional:
 *   modelo de resiliência §VIII/FR-006. NÃO adicione try/catch aqui.
 */
export async function extractNativeText(
  bytes: Uint8Array,
): Promise<NativeExtraction> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const arr = Array.isArray(text) ? text : [text];
  const pages: PageText[] = arr.map((content, i) => ({
    page: i + 1,
    content: content ?? "",
  }));
  return { totalPages, pages };
}
