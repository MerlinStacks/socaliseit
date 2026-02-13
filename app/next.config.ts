import type { NextConfig } from "next";
import { getSecurityHeaders } from "@/lib/security-headers";

const nextConfig: NextConfig = {
  /**
   * Enable standalone output for production Docker deployments.
   * This creates a minimal build with only necessary files.
   */
  output: "standalone",

  /**
   * Transpile Remotion packages for Next.js compatibility.
   * Remotion uses ESM modules that require explicit transpilation.
   */
  transpilePackages: [
    "remotion",
    "@remotion/player",
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/media-utils",
    "@remotion/cli",
  ],

  /**
   * Increase body size limits for media uploads
   * - serverActions.bodySizeLimit: For Server Actions
   * - proxyClientMaxBodySize: For proxy request buffering
   * Note: App Router route handlers don't have a global body limit config.
   * Large uploads bypass Next.js body parsing when using FormData.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: '110mb',
    },
    proxyClientMaxBodySize: '110mb',
    optimizePackageImports: ['lucide-react', 'date-fns', 'framer-motion', '@remotion/player'],
  },

  /**
   * Turbopack config (Next.js 16+ uses Turbopack by default)
   * Empty config silences the webpack migration warning
   */
  turbopack: {
    root: __dirname,
  },

  /**
   * Security headers applied to all routes.
   * CSP is relaxed in development to allow Next.js hot reloading.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: getSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
