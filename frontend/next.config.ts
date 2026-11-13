import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: "standalone",
  reactCompiler: true,
  poweredByHeader: false,
  images: {
    // Seed-data photos are several MB; serve them resized (NFR5.3.1). Only this host is optimised.
    remotePatterns: [{ protocol: "https", hostname: "raw.githubusercontent.com" }],
  },
}

export default nextConfig
