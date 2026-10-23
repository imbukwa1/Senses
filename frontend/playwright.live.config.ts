import { defineConfig, devices } from "@playwright/test";

// Deliberately independent of the database-provisioning E2E configuration.
const authenticated = process.env.E2E_LIVE_AUTH === "1";
if (authenticated && (!process.env.E2E_LIVE_EMAIL || !process.env.E2E_LIVE_PASSWORD)) {
  throw new Error("Authenticated smoke tests require E2E_LIVE_EMAIL and E2E_LIVE_PASSWORD.");
}
export default defineConfig({
  testDir: "./e2e/live",
  outputDir: "./e2e-artifacts/live-results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { outputFolder: "e2e-artifacts/live-report", open: "never" }],
    ["json", { outputFile: "e2e-artifacts/live-results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://senses-gules.vercel.app",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    // Authenticated captures may include tokens or private project data.
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    { name: "public-desktop", testMatch: "public.spec.ts", use: { ...devices["Desktop Chrome"] } },
    { name: "public-mobile", testMatch: "public.spec.ts", use: { ...devices["Pixel 7"] } },
    ...(authenticated ? [{ name: "authenticated-readonly", testMatch: "authenticated.spec.ts",
      use: { ...devices["Desktop Chrome"] } }] : []),
    ...(process.env.E2E_LIVE_SETUP === "1" ? [{ name: "project-setup", testMatch: "project-setup.spec.ts",
      use: { ...devices["Desktop Chrome"] } }] : []),
  ],
});
