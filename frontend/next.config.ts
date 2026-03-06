import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      tailwindcss: path.resolve(__dirname, "node_modules/tailwindcss"),
    },
  },
  serverExternalPackages: [
    "@reown/appkit",
    "@reown/appkit-controllers",
    "@reown/appkit-utils",
    "thread-stream",
  ],
};

export default nextConfig;
