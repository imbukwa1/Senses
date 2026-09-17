import { expect, test } from "@playwright/test";

import { loginViaUi } from "./helpers/auth";
import { e2eUsers } from "./helpers/users";

test.describe("Team Calendar", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page, e2eUsers()[0]);
    await page.goto("/team-calendar");
    await expect(page.getByRole("heading", { name: /team calendar/i })).toBeVisible();
  });

  test("supports Month, Week, and Day views", async ({ page }) => {
    for (const view of ["Month", "Week", "Day"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect(page.getByRole("button", { name: view, exact: true })).toBeVisible();
    }
  });

  test("shows period navigation and event creation", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Previous period" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next period" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Event" })).toBeVisible();
  });
});
