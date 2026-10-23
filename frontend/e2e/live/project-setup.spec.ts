import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const projectId = process.env.E2E_LIVE_SETUP_PROJECT_ID;
const pm = { email: process.env.E2E_LIVE_SETUP_PM_EMAIL, password: process.env.E2E_LIVE_SETUP_PM_PASSWORD };
const member = { email: process.env.E2E_LIVE_SETUP_MEMBER_EMAIL, password: process.env.E2E_LIVE_SETUP_MEMBER_PASSWORD };
const configured = Boolean(projectId && pm.email && pm.password && member.email && member.password);

test.describe("project setup stakeholder and resource submissions", () => {
  test.skip(!configured, "Set E2E_LIVE_SETUP_PROJECT_ID and PM/member credentials to run live setup coverage.");

  test("PM can create both records and see them after reload", async ({ page }) => {
    await login(page, pm.email!, pm.password!);
    await page.goto(`/projects/${projectId}?tab=setup`);

    const stakeholderName = `E2E stakeholder ${Date.now()}`;
    await page.getByRole("button", { name: /Stakeholders/ }).click();
    await page.getByLabel("Stakeholder", { exact: true }).fill(stakeholderName);
    await page.getByLabel("Interest / Role", { exact: true }).fill("Regression test role");
    const stakeholderResponse = captureSetupPost(page, "/setup/stakeholders");
    await page.getByRole("button", { name: "Add Stakeholder", exact: true }).click();
    await expect((await stakeholderResponse).status()).toBe(201);
    await expect(page.getByText(stakeholderName, { exact: true })).toBeVisible();

    const resourceName = `E2E resource ${Date.now()}`;
    await page.getByRole("button", { name: /Resources/ }).click();
    await page.getByPlaceholder("Resource", { exact: true }).fill(resourceName);
    const resourceResponse = captureSetupPost(page, "/setup/resources");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect((await resourceResponse).status()).toBe(201);
    await expect(page.getByText(resourceName, { exact: true })).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: /Stakeholders/ }).click();
    await expect(page.getByText(stakeholderName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Resources/ }).click();
    await expect(page.getByText(resourceName, { exact: true })).toBeVisible();
  });

  test("422 details are displayed and permission is enforced", async ({ page, request }) => {
    const pmToken = await loginViaApi(request, pm.email!, pm.password!);
    const invalidStakeholder = await request.post(`/projects/${projectId}/setup/stakeholders`, {
      headers: { Authorization: `Bearer ${pmToken}` },
      data: { name: "x".repeat(256), interest_role: "Regression" },
    });
    await recordSanitizedResponse("stakeholder validation", invalidStakeholder);
    expect(invalidStakeholder.status()).toBe(422);
    expect((await invalidStakeholder.json()).error.message).toContain("name");

    const invalidResource = await request.post(`/projects/${projectId}/setup/resources`, {
      headers: { Authorization: `Bearer ${pmToken}` },
      data: { resource_type: "People", name: "x".repeat(201), notes: null },
    });
    await recordSanitizedResponse("resource validation", invalidResource);
    expect(invalidResource.status()).toBe(422);
    expect((await invalidResource.json()).error.message).toContain("name");

    await login(page, pm.email!, pm.password!);
    await page.goto(`/projects/${projectId}?tab=setup`);
    await page.getByRole("button", { name: /Resources/ }).click();
    await page.route(`**/projects/${projectId}/setup/resources`, async route => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: { message: "name: too long" } }) });
      } else {
        await route.continue();
      }
    });
    await page.getByPlaceholder("Resource", { exact: true }).fill("A valid-looking resource");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("name: too long", { exact: true })).toBeVisible();

    const memberToken = await loginViaApi(request, member.email!, member.password!);
    for (const endpoint of ["stakeholders", "resources"]) {
      const response = await request.post(`/projects/${projectId}/setup/${endpoint}`, {
        headers: { Authorization: `Bearer ${memberToken}` },
        data: endpoint === "stakeholders"
          ? { name: "Denied", interest_role: "Denied" }
          : { resource_type: "People", name: "Denied", notes: null },
      });
      await recordSanitizedResponse(`${endpoint} permission`, response);
      expect(response.status()).toBe(403);
    }
  });
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function loginViaApi(api: APIRequestContext, email: string, password: string) {
  const response = await api.post("/auth/login", { data: { email, password } });
  expect(response.status()).toBe(200);
  return (await response.json()).access_token as string;
}

function captureSetupPost(page: Page, suffix: string) {
  return page.waitForResponse(async response => {
    if (response.request().method() !== "POST" || !new URL(response.url()).pathname.endsWith(suffix)) return false;
    const body = response.request().postDataJSON() as Record<string, unknown> | null;
    console.log(JSON.stringify({ method: "POST", path: new URL(response.url()).pathname, status: response.status(), fields: Object.keys(body ?? {}).sort() }));
    return true;
  });
}

async function recordSanitizedResponse(label: string, response: import("@playwright/test").APIResponse) {
  const body = await response.json().catch(() => undefined) as { error?: { message?: unknown } } | undefined;
  console.log(JSON.stringify({ label, status: response.status(), errorMessage: typeof body?.error?.message === "string" ? body.error.message : undefined }));
}
