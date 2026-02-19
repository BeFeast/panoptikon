import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Static export — no Node.js server needed at runtime.
  // The exported files will be embedded in the Rust binary.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
