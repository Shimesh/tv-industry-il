import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'firebase/app',
      'firebase/firestore',
      'firebase/auth',
      'firebase/storage',
      'lucide-react',
      'framer-motion',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
