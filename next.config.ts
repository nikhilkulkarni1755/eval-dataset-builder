import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    // Needed for server actions in layouts
  },
  // Ensure generation route can run up to 300s on Vercel Pro
  serverExternalPackages: ['@anthropic-ai/sdk'],
}

export default nextConfig
