import { defineConfig, devices } from "@playwright/test";

const platformPort = process.env.E2E_PORT ?? "3100";
const platformBaseUrl = `http://127.0.0.1:${platformPort}`;

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: /site\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: platformBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
  webServer: {
    command: "pnpm tsx scripts/start-e2e.ts",
    url: `${platformBaseUrl}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
  },
});
