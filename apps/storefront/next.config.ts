import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Consume workspace TypeScript packages directly.
  transpilePackages: ['@dogfood/auth', '@dogfood/contracts'],
  // Better Auth's pg driver is server-only; keep it external to the bundle.
  serverExternalPackages: ['pg', 'better-auth'],
}

export default nextConfig
