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
    serverComponentsExternalPackages: ["@resvg/resvg-wasm"],
  },
};

export default nextConfig;
