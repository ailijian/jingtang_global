import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  transpilePackages: ["@jingtang/ui"],
};

export default config;
