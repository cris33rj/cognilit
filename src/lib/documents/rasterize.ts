import { renderPageAsImage } from "unpdf";

export interface RasterizedPage {
  imageBase64: string;
  mediaType: "image/png";
}

/**
 * Rasteriza uma página do PDF em PNG base64 para OCR multimodal (R2).
 * Tipo da função de seam injetada no worker (permite fake nos testes).
 * A implementação real depende do backend de canvas do unpdf no Node — CALIBRAR
 * contra PDFs escaneados reais (D31). Erros aqui viram falha de sub-passo no worker.
 *
 * Em Node.js, `renderPageAsImage` usa `@napi-rs/canvas` como backend (canvasImport).
 * Se o pacote não estiver instalado, passar `canvasImport` explicitamente ou instalar
 * `@napi-rs/canvas` antes de habilitar o caminho OCR em produção.
 */
export type RasterizePage = (
  bytes: Uint8Array,
  page: number,
) => Promise<RasterizedPage>;

export const rasterizePage: RasterizePage = async (bytes, page) => {
  // Overload sem toDataURL retorna Promise<ArrayBuffer>; cast necessário pois
  // TypeScript infere a união dos overloads quando options é parcialmente omitido.
  const result = await renderPageAsImage(bytes, page, { scale: 2 }); // 2× resolução: equilíbrio qualidade de OCR vs. memória; recalibrar em D31
  if (!(result instanceof ArrayBuffer)) {
    throw new Error(
      `rasterizePage: esperado ArrayBuffer de renderPageAsImage, recebido ${typeof result}`,
    );
  }
  const buf = Buffer.from(result);
  return { imageBase64: buf.toString("base64"), mediaType: "image/png" };
};
