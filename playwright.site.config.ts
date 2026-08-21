import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /site\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3200",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "pnpm build:packages && pnpm --filter @jingtang/site dev --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200/en/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
