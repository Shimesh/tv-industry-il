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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://maps.gstatic.com",
              "frame-src 'self' https://maps.google.com https://www.google.com https://www.youtube.com https://youtube.com",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
