import { request } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`E2E safety check failed: ${name} is required.`);
  return value;
}

export default async function globalSetup() {
  const databaseUrl = required("E2E_DATABASE_URL");
  const databaseName = new URL(databaseUrl.replace(/^postgresql?:\/\//, "http://")).pathname.slice(1);
  if (databaseName !== "senses_test" && !databaseName.endsWith("_test")) {
    throw new Error(`E2E safety check failed: refusing database '${databaseName}'. Use senses_test only.`);
  }

  const apiContext = await request.newContext({
    baseURL: required("E2E_API_BASE_URL").replace(/\/+$/, ""),
    timeout: 5000,
  });
  try {
    const health = await apiContext.get("/health");
    if (!health.ok()) throw new Error(`E2E backend health check failed with HTTP ${health.status()}.`);
  } finally {
    await apiContext.dispose();
  }

  const python = process.env.E2E_PYTHON ?? "../Backend/.venv/Scripts/python.exe";
  const fixtureProcess = spawnSync(python, ["../Backend/tests/e2e_users.py", "provision"], {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONPATH: "../Backend" },
    encoding: "utf8",
    timeout: 30000,
  });
  if (fixtureProcess.error) throw new Error(`E2E fixture provisioning failed: ${fixtureProcess.error.message}`);
  if (fixtureProcess.status !== 0) throw new Error(`E2E fixture provisioning failed: ${fixtureProcess.stderr || fixtureProcess.stdout}`);
  mkdirSync("e2e-artifacts", { recursive: true });
  writeFileSync("e2e-artifacts/fixture-state.json", fixtureProcess.stdout);
}
