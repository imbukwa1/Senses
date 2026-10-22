import { expect, test } from "@playwright/test";

// No fixtures, database access, account creation, or project mutations.
test("login renders usable controls", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response?.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Sign in to SPMS" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
});

test("empty submission validates without contacting authentication", async ({ page }) => {
  await page.goto("/login");
  let submissions = 0;
  page.on("request", request => {
    if (request.method() === "POST") submissions++;
  });
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(submissions).toBe(0);
});

for (const path of ["/", "/projects", "/attention", "/my-work", "/team-calendar", "/search"]) {
  test(`unauthenticated ${path} redirects to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { name: "Sign in to SPMS" })).toBeVisible();
  });
}
