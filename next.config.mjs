/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Disable client-side router cache so server components always re-render
    // on soft navigation. Needed for dynamic pages like /reviews/[reviewId].
    staleTimes: {
      dynamic: 0,
    },
    serverActions: {
      bodySizeLimit: "51mb", // aceita upload de PDF ≤ 50 MiB (A4)
    },
    // Marco 3 / Fatia 1: @resvg/resvg-wasm é carregado em runtime no route Node
    // (PNG do fluxograma PRISMA, A2). Mantê-lo fora do bundle evita o erro de
    // parse de WebAssembly do webpack; o pacote é require()-ado do node_modules
    // e o .wasm é lido por fs em src/lib/prisma/png.ts.
    //
    // Marco 3 / Fatia 6: o export PDF (pdfmake → @foliojs-fork/pdfkit →
    // fontkit/linebreak) lê arquivos binários `.trie` por fs no module-eval. O
    // bundle webpack do Next move o JS para .next/server/vendor-chunks mas NÃO
    // copia os `.trie` → ENOENT (data.trie). Externalizar faz o Next require()-ar
    // do node_modules, onde os `.trie` existem ao lado do módulo (A2).
    serverComponentsExternalPackages: [
      "@resvg/resvg-wasm",
      "pdfmake",
      "@foliojs-fork/pdfkit",
      "@foliojs-fork/fontkit",
      "@foliojs-fork/linebreak",
      // citeproc breaks when bundled/minified by webpack (CSL.Engine throws in
      // addMissingNameNodes), failing the DOCX/PDF exports in production builds.
      "citeproc",
    ],
  },
};

export default nextConfig;
