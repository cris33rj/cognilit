import type { Chunk } from "@/lib/ai/embedding/types";

export interface LayerInput {
  document_id: string;
  page: number;
  char_start: number;
  char_end: number;
  content: string;
  origin: "nativo" | "ocr_ia";
}

export interface ChunkOptions {
  maxChars: number; // ~512 tokens ≈ 2048 chars; default abaixo é conservador
  overlapChars: number; // ~15% overlap (R6)
}

const DEFAULTS: ChunkOptions = { maxChars: 2000, overlapChars: 300 };

/**
 * Divide cada text_layer em janelas de caracteres com overlap, mantendo a ÂNCORA
 * (document_id, page, char_start/char_end relativos ao texto da página) e a origin
 * (R6/FR-024). Por página: o chunk é verificável contra o PDF. Camadas vazias são
 * descartadas. char_start/char_end são posições DENTRO do content da camada.
 */
export function chunkLayers(
  layers: LayerInput[],
  options: ChunkOptions = DEFAULTS,
): Chunk[] {
  const { maxChars, overlapChars } = options;
  const step = Math.max(1, maxChars - overlapChars);
  const out: Chunk[] = [];

  for (const l of layers) {
    const text = l.content;
    if (text.trim().length === 0) continue;
    if (text.length <= maxChars) {
      out.push({
        document_id: l.document_id,
        page: l.page,
        char_start: 0,
        char_end: text.length,
        origin: l.origin,
        content: text,
      });
      continue;
    }
    for (let start = 0; start < text.length; start += step) {
      const end = Math.min(start + maxChars, text.length);
      out.push({
        document_id: l.document_id,
        page: l.page,
        char_start: start,
        char_end: end,
        origin: l.origin,
        content: text.slice(start, end),
      });
      if (end === text.length) break;
    }
  }
  return out;
}
