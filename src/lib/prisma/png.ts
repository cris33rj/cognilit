import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

let wasmReady: Promise<void> | null = null;

/** Inicializa o wasm uma única vez (lê o binário do pacote, runtime Node — A2). */
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = (async () => {
      const require = createRequire(import.meta.url);
      // Specifier montado em runtime: impede o webpack do Next de traçar e tentar
      // bundlar o .wasm como módulo (erro "module is not flagged as WebAssembly").
      // O pacote fica external (next.config serverComponentsExternalPackages) e o
      // .wasm é lido do node_modules em runtime Node — A2.
      const wasmSpecifier = ["@resvg", "resvg-wasm", "index_bg.wasm"].join("/");
      const wasmPath = require.resolve(wasmSpecifier);
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
