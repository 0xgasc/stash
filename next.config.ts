/**
 * Next.js configuration.
 *
 * Allows Next.js Image optimization for remote images served from
 * Irys devnet (devnet.irys.xyz) and Arweave mainnet (arweave.net).
 */
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
