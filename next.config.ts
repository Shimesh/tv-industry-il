import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy Firebase Auth handler through our domain so signInWithRedirect works.
      // Without this, getRedirectResult fails with "illegal url for new iframe"
      // because the browser blocks cross-origin iframes from firebaseapp.com.
      // See: https://firebase.google.com/docs/auth/web/redirect-best-practices
      {
        source: "/__/auth/:path*",
        destination: "https://tv-industry-il.firebaseapp.com/__/auth/:path*",
      },
    ];
  },
};

export default nextConfig;
