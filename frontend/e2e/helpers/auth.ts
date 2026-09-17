import { expect, type APIRequestContext, type Page } from "@playwright/test";

import type { E2EUser } from "./users";

export async function loginViaUi(page: Page, user: E2EUser) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function loginViaApi(request: APIRequestContext, user: E2EUser) {
  const response = await request.post("/auth/login", { data: { email: user.email, password: user.password } });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).access_token as string;
}
