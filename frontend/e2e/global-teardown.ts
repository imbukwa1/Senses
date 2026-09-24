import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

export default function globalTeardown() {
  const statePath = "e2e-artifacts/fixture-state.json";
  if (!existsSync(statePath)) return;
  const python = process.env.E2E_PYTHON ?? "../Backend/.venv/Scripts/python.exe";
  const result = spawnSync(python, ["../Backend/tests/e2e_users.py", "cleanup"], {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONPATH: "../Backend" },
    input: readFileSync(statePath),
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`E2E fixture cleanup failed: ${result.stderr || result.stdout}`);
}
