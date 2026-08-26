import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(appDirectory, "../.."));

const config: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  logging: {
    incomingRequests: {
      ignore: [
        /\/api\/v1\/channels\/(?:youtube|facebook)\/oauth\/callback/u,
        /\/api\/v1\/channels\/facebook\/(?:deauthorize|data-deletion)/u,
      ],
    },
  },
  reactStrictMode: true,
};

export default config;
