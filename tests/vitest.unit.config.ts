import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/platform/src/**/*.test.ts",
      "scripts/lib/**/*.test.ts",
    ],
    exclude: ["packages/i18n/**/*.test.ts", "**/node_modules/**"],
    environment: "node",
    coverage: { provider: "v8", reporter: ["text", "json-summary"] },
  },
});
