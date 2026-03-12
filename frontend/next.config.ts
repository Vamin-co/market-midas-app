import type { NextConfig } from "next";

// When building for Tauri (production), we output a static export.
// In dev mode, we use the normal Next.js dev server (devUrl in tauri.conf.json).
const isTauriBuild = process.env.TAURI_ENV_TARGET_TRIPLE !== undefined;

const nextConfig: NextConfig = {
  ...(isTauriBuild && {
    output: "export",
    distDir: "out",
  }),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
