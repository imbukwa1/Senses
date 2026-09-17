import { expect, test } from "@playwright/test";

import { loginViaUi } from "./helpers/auth";
import { e2eUsers } from "./helpers/users";

test("authenticated navigation exposes the required global order", async ({ page }) => {
  await loginViaUi(page, e2eUsers()[0]);
  const labels = await page.locator("nav a").allTextContents();
  expect(labels.map((label) => label.trim()).filter(Boolean)).toEqual(["Home", "Projects", "Attention", "My Work", "Team Calendar"]);
});

test("authenticated user can load the major global routes", async ({ page }) => {
  await loginViaUi(page, e2eUsers()[0]);
  for (const path of ["/", "/projects", "/attention", "/my-work", "/team-calendar"]) {
    await page.goto(path);
    await expect(page.locator("body")).not.toContainText(/could not be loaded|server is unavailable/i);
  }
});

test("unauthenticated protected navigation redirects to login", async ({ page }) => {
  for (const path of ["/", "/projects", "/attention", "/my-work", "/team-calendar"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});
