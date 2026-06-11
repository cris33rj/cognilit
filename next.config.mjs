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
  },
};

export default nextConfig;
