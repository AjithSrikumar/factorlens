import type { NextConfig } from "next";

// Loader path from orchids-visual-edits - use direct resolve to get the actual file
const loaderPath = require.resolve('orchids-visual-edits/loader.js');

const nextConfig: NextConfig = {
  serverExternalPackages: ['postgres', 'undici'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent undici from being bundled (it uses node: URIs that webpack can't handle)
      config.externals = config.externals || []
      if (Array.isArray(config.externals)) {
        config.externals.push('undici')
      }
    }
    return config
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  turbopack: {
    rules: {
      "*.{jsx,tsx}": {
        loaders: [loaderPath]
      }
    }
  }
} as NextConfig;

export default nextConfig;
