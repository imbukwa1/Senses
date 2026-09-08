import http from "node:http";
import net from "node:net";
import { URL } from "node:url";

import { createDocumentCollaborationServer, documentReadiness } from "./document-server.js";
import { loadConfig, univerReadiness, validateDocumentConfig } from "./config.js";
import { createPool } from "./store.js";

const config = loadConfig();
const missing = validateDocumentConfig(config);

if (missing.length > 0) {
  throw new Error(`Missing collaboration configuration: ${missing.join(", ")}`);
}

const pool = createPool(config.databaseUrl);
const documentServer = createDocumentCollaborationServer({ config, pool });
const healthServer = http.createServer(async (request, response) => {
  const documents = await checkDocuments();
  if (request.url === "/documents/health") {
    response.writeHead(documents.ready ? 200 : 503, { "Content-Type": "application/json" });
    response.end(JSON.stringify(documents));
    return;
  }

  const checks = { documents, univer: await checkUniver(), sharedCoordination: await checkSharedCoordination() };

  const ready = checks.documents.ready && checks.univer.ready && checks.sharedCoordination.ready;
  response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ready, checks }));
});

const healthPort = Number(process.env.COLLABORATION_HEALTH_PORT || 1235);

documentServer.listen();
healthServer.listen(healthPort, config.host, () => {
  console.log(`SENSES collaboration health listening on http://${config.host}:${healthPort}`);
});

async function shutdown() {
  await documentServer.destroy();
  await new Promise((resolve) => healthServer.close(resolve));
  await pool.end();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

async function checkDocuments() {
  try {
    await documentReadiness(pool);
    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : "Document collaboration readiness failed",
    };
  }
}

async function checkUniver() {
  const baseline = univerReadiness(config);
  if (!baseline.configured || !baseline.healthUrl) {
    return {
      ...baseline,
      ready: false,
      error: "Official Univer collaboration service is not configured.",
    };
  }

  try {
    const response = await fetch(baseline.healthUrl);
    return {
      ...baseline,
      ready: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      ...baseline,
      ready: false,
      error: error instanceof Error ? error.message : "Univer collaboration readiness failed",
    };
  }
}

async function checkSharedCoordination() {
  if (!config.sharedCoordinationUrl) {
    return {
      configured: false,
      ready: false,
      required: ["SHARED_COORDINATION_URL"],
      error: "Shared coordination is required before multi-instance collaboration deployment.",
    };
  }

  try {
    const url = new URL(config.sharedCoordinationUrl);
    const port = Number(url.port || (url.protocol === "redis:" ? 6379 : 0));
    if (!url.hostname || !port) {
      throw new Error("Shared coordination URL must include a host and port.");
    }
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: url.hostname, port, timeout: 2000 }, resolve);
      socket.on("error", reject);
      socket.on("timeout", () => reject(new Error("Shared coordination connection timed out")));
      socket.on("connect", () => socket.end());
    });
    return { configured: true, ready: true, required: ["SHARED_COORDINATION_URL"] };
  } catch (error) {
    return {
      configured: true,
      ready: false,
      required: ["SHARED_COORDINATION_URL"],
      error: error instanceof Error ? error.message : "Shared coordination readiness failed",
    };
  }
}
