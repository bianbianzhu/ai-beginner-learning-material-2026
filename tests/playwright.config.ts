import { defineConfig } from "@playwright/test";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  // Only spin up the lesson 32 servers when running network tests
  webServer: NETWORK
    ? [
        {
          command: "pnpm l32:server",
          port: 3000,
          reuseExistingServer: true,
          timeout: 30_000,
        },
        {
          command: "pnpm l32:web",
          port: 5173,
          reuseExistingServer: true,
          timeout: 30_000,
        },
      ]
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
