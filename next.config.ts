import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: everything (Firebase, Stockfish) runs in the browser,
  // so Cloudflare Pages can host it for free. Server-only code lives in /functions.
  output: "export",
  // cacheComponents / partialPrefetching are not allowed with output: "export".
  images: { unoptimized: true },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
