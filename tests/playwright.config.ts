import { defineConfig } from "@playwright/test";

// Single Chromium project. Lessons that hit OpenAI API are tagged @network
// and gated by RUN_NETWORK_TESTS=1 (see root package.json scripts).
// 32-web-demo defines its own webServer inline because no other spec needs one.
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Lessons share the same OPENAI_API_KEY rate limit
  workers: 1,
  reporter: [["list"]],
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
