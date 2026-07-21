import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    serverActions: {
      // Submit/claim forms accept 1 logo + 4 screenshots at ≤4 MB each
      // (validated in src/lib/storage.ts); the framework default is 1 MB.
      bodySizeLimit: "25mb",
    },
  },
};

export default withNextIntl(nextConfig);
