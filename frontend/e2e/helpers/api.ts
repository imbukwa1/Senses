import { expect, type APIRequestContext } from "@playwright/test";

export async function authorizedGet(request: APIRequestContext, path: string, token: string) {
  const response = await request.get(path, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok(), `${path} returned HTTP ${response.status()}`).toBeTruthy();
  return response;
}
