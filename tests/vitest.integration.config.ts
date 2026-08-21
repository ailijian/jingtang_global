import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@jingtang/db": fileURLToPath(new URL("../packages/db/src/index.ts", import.meta.url)),
      "@jingtang/domain": fileURLToPath(
        new URL("../packages/domain/src/index.ts", import.meta.url),
      ),
      "@jingtang/application": fileURLToPath(
        new URL("../packages/application/src/index.ts", import.meta.url),
      ),
      "@jingtang/integrations": fileURLToPath(
        new URL("../packages/integrations/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
});
