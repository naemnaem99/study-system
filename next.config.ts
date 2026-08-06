import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'stories.freepiklabs.com',
        pathname: '/storage/**',
      },
    ],
  },
};

export default nextConfig;
