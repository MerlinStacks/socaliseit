import type { NextConfig } from "next";

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
   * Increase body size limit for media uploads
   * Default is 1MB which is too small for video files
   */
  experimental: {
    serverActions: {
      bodySizeLimit: '110mb',
    },
  },

  /**
   * Turbopack config (Next.js 16+ uses Turbopack by default)
   * Empty config silences the webpack migration warning
   */
  turbopack: {},
};

export default nextConfig;

