// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.wolf-gym.com" }],
        destination: "https://wolf-gym.com/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "wolf-gym.s3.us-east-1.amazonaws.com",
        pathname: "/**", // o "/uploads/**" si prefieres restringir
      },
    ],
  },
};

export default nextConfig;
