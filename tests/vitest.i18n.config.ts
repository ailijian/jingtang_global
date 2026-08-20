import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["packages/i18n/**/*.test.ts"], environment: "node" },
});
