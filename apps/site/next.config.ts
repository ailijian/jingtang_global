import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(appDirectory, "../..");

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  turbopack: {
    root: repositoryDirectory,
    resolveAlias: {
      "@jingtang/i18n": "./packages/i18n/dist/index.js",
    },
  },
};

export default config;
