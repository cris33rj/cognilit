import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

let wasmReady: Promise<void> | null = null;

/** Inicializa o wasm uma única vez (lê o binário do pacote, runtime Node — A2). */
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      // Caminho do .wasm ancorado em process.cwd() (raiz do projeto). Evita
      // require.resolve/createRequire — o webpack do Next rastreia o binding do
      // createRequire e reescreve o `.resolve(...)` para um module id numérico,
      // quebrando dirname() (ERR_INVALID_ARG_TYPE). O pacote é external
      // (next.config serverComponentsExternalPackages) e roda em runtime Node — A2.
      // Deploy serverless: incluir este .wasm no file tracing (follow-up das
      // fatias de exportação).
      const wasmPath = join(
        process.cwd(),
        "node_modules",
        "@resvg",
        "resvg-wasm",
        "index_bg.wasm",
      );
      const bytes = await readFile(wasmPath);
      await initWasm(bytes);
    })();
  }
  return wasmReady;
}

/** Rasteriza o SVG do fluxograma em PNG. Mesma fonte do SVG (sem recontar). */
export async function renderPrismaPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}
