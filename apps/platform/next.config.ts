import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
loadEnvConfig(path.resolve(appDirectory, "../.."));

const config: NextConfig = {
  reactStrictMode: true,
};

export default config;
