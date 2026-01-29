import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'devnet.irys.xyz',
      },
      {
        protocol: 'https',
        hostname: 'arweave.net',
      },
    ],
  },
};

export default nextConfig;
