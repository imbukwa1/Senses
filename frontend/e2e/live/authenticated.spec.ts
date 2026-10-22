import { expect, test } from "@playwright/test";

// Existing dedicated account only. Credentials come from environment/CI secrets.
// These are route smoke tests, not feature acceptance or permission-isolation tests.
test("existing user signs in and global routes return successful API responses", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_LIVE_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_LIVE_PASSWORD!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login(?:[?#].*)?$/);
  await expect(page.getByRole("navigation")).toBeVisible();

  for (const path of ["/", "/projects", "/attention", "/my-work", "/team-calendar", "/search"]) {
    await test.step(`Read-only route ${path}`, async () => {
      // Arm before navigation so a loading shell cannot count as success.
      const apiResponse = path === "/search" ? null : page.waitForResponse(response =>
        response.request().resourceType() === "fetch" &&
        response.request().method() === "GET" &&
        !new URL(response.url()).pathname.includes("/auth/"));
      const response = await page.goto(path);
      expect(response?.ok()).toBeTruthy();
      await expect(page).not.toHaveURL(/\/login(?:[?#].*)?$/);
      await expect(page.getByRole("navigation")).toBeVisible();
      // Search without a query intentionally may not fetch results.
      if (apiResponse) expect((await apiResponse).ok()).toBeTruthy();
      await expect(page.locator("body")).not.toContainText(
        /server is unavailable|something went wrong|could not be loaded/i);
    });
  }
});
