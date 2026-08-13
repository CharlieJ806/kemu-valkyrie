import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 纯客户端应用 → 静态导出(产出 out/,供 Cloudflare Pages 托管)
  output: "export",

  // Optimize for static client-side app
  images: {
    unoptimized: true, // We use base64 icons, no Next.js image optimization needed
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },

  // Compress large data files
  experimental: {
    optimizePackageImports: ["zustand"],
  },
};

export default nextConfig;
