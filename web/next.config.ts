import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Production: static export served by Rust binary.
  // Development: Next.js dev server with API proxy to Rust backend.
  ...(isDev
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://10.10.0.14:8080/api/:path*",
            },
          ];
        },
      }
    : {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }),
};

export default nextConfig;
