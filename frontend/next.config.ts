import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: "..",
  },
  serverExternalPackages: [
    "@reown/appkit",
    "@reown/appkit-controllers",
    "@reown/appkit-utils",
    "thread-stream",
  ],
};

export default nextConfig;
