import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "*.pinggy.net",
    "*.free.pinggy.net",
    "*.run.pinggy-free.link",
    "*.loca.lt",
    "localhost:3000",
    "192.168.12.64",
    "192.168.12.64:3000"
  ],
};

export default nextConfig;
