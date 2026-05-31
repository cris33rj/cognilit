/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Disable client-side router cache so server components always re-render
    // on soft navigation. Needed for dynamic pages like /reviews/[reviewId].
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
