import withPWAInit from 'next-pwa';
import { existsSync, readFileSync } from 'node:fs';
import { resolveDeploymentId } from './src/lib/deploymentVersion.js';

const generatedDeploymentId = existsSync('.deployment-id')
  ? readFileSync('.deployment-id', 'utf8').trim()
  : '';
const deploymentId = resolveDeploymentId({
  nextDeploymentId: process.env.NEXT_DEPLOYMENT_ID,
  vercelDeploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  gitSha: process.env.VERCEL_GIT_COMMIT_SHA,
  generatedId: generatedDeploymentId,
});

const withPWA = withPWAInit({
  dest: 'public',
  register: false,
  skipWaiting: true,
  customWorkerDir: 'worker',
  cacheStartUrl: false,
  dynamicStartUrl: true,
  cacheOnFrontEndNav: false,
  fallbacks: {
    document: '/~offline',
  },
  disable: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  deploymentId,
  env: {
    NEXT_PUBLIC_DEPLOYMENT_ID: deploymentId,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Compiler options
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Package optimization & Experimental features
  experimental: {
    optimizePackageImports: ['lucide-react', '@tanstack/react-virtual'],
  },
  turbopack: {},
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/workbox-:path",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
