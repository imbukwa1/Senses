export type E2EUser = { email: string; password: string };

export function e2eUsers(): E2EUser[] {
  const password = process.env.E2E_PASSWORD?.trim();
  if (!password) throw new Error("E2E safety check failed: E2E_PASSWORD is required.");
  return Array.from({ length: 16 }, (_, index) => ({
    email: process.env[`E2E_USER${String(index + 1).padStart(2, "0")}_EMAIL`] ?? `e2e.user${String(index + 1).padStart(2, "0")}@example.com`,
    password,
  }));
}
