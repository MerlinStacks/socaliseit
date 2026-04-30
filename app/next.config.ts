import type { NextConfig } from "next";
import { getSecurityHeaders } from "@/lib/security-headers";

const nextConfig = {
  /**
   * Enable standalone output for production Docker deployments.
   * This creates a minimal build with only necessary files.
   */
  output: "standalone",

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
    optimizePackageImports: ['lucide-react', 'date-fns', 'framer-motion'],
    /**
     * Client-side router cache TTLs.
     * Why: Back-navigation and revisiting pages is instant for 60s (dynamic)
     * or 5min (static) without refetching the RSC payload.
     */
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
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

export default nextConfig as NextConfig;
