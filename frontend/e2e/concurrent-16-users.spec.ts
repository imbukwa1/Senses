import { expect, test } from "@playwright/test";

import { loginViaUi } from "./helpers/auth";
import { e2eUsers } from "./helpers/users";

test("16 independent authenticated contexts remain responsive", async ({ browser }) => {
  const users = e2eUsers();
  const timings: number[] = [];
  const contexts = await Promise.all(users.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  const failures: string[] = [];
  try {
    await Promise.all(pages.map(async (page, index) => {
      page.on("pageerror", (error) => failures.push(`user ${index + 1}: ${error.message}`));
      page.on("response", (response) => { if (response.status() >= 500) failures.push(`user ${index + 1}: HTTP ${response.status()} ${response.url()}`); });
      const started = Date.now();
      await loginViaUi(page, users[index]);
      await page.goto(index < 4 ? "/" : index < 8 ? "/projects" : "/team-calendar");
      await expect(page.locator("body")).not.toContainText(/server is unavailable|could not be loaded/i);
      timings.push(Date.now() - started);
    }));
    expect(failures, failures.join("\n")).toEqual([]);
    expect(Math.max(...timings)).toBeLessThan(5000);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
