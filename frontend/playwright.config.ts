import { defineConfig, devices } from "@playwright/test";

const windows = process.platform === "win32";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: ["**/global-setup.ts", "**/global-teardown.ts", "**/helpers/**"],
  outputDir: "./e2e-artifacts/test-results",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: !windows,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: windows ? 1 : (process.env.CI ? 2 : undefined),
  reporter: [["list"], ["html", { outputFolder: "./e2e-artifacts/report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5174",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    navigationTimeout: 5000,
    actionTimeout: 5000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(process.env.E2E_BROWSERS === "all" ? [
      { name: "firefox", use: { ...devices["Desktop Firefox"] } },
      { name: "webkit", use: { ...devices["Desktop Safari"] } },
    ] : []),
  ],
});
