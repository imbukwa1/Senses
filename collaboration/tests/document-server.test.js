import { createHmac } from "node:crypto";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { loadConfig } from "../src/config.js";
import { createDocumentCollaborationServer } from "../src/document-server.js";
import { documentRoomName } from "../src/rooms.js";
import { createPool, fetchDocumentState, storeDocumentState, userCanAccessDocument } from "../src/store.js";

const rawDatabaseUrl = process.env.COLLABORATION_DATABASE_URL || process.env.DATABASE_URL;
const databaseUrl = rawDatabaseUrl?.includes("@") ? rawDatabaseUrl : "";
const runWithDatabase = databaseUrl ? describe : describe.skip;
const SECRET = "test-collaboration-secret";

runWithDatabase("document collaboration service", () => {
  let pool;
  let server;
  let port;
  let records;
  let providers;

  beforeEach(async () => {
    pool = createPool(databaseUrl);
    await assertCollaborationMigration(pool);
    records = await createRecords(pool);
    providers = [];
    port = 14000 + Math.floor(Math.random() * 1000);
    server = createDocumentCollaborationServer({
      config: {
        ...loadConfig({
          AUTH_TOKEN_SECRET: SECRET,
          DATABASE_URL: databaseUrl,
          DOCUMENT_COLLABORATION_PORT: String(port),
          DOCUMENT_COLLABORATION_HOST: "127.0.0.1",
          DOCUMENT_COLLABORATION_PATH: "/documents",
        }),
        authTokenSecret: SECRET,
        databaseUrl,
        documentPort: port,
        host: "127.0.0.1",
        documentPath: "/documents",
      },
      pool,
    });
    await server.listen();
  });

  afterEach(async () => {
    for (const provider of providers) {
      provider.destroy();
    }
    if (server) {
      await server.destroy();
    }
    if (pool) {
      await pool.end();
    }
  });

  it("enforces project membership before opening a document room", async () => {
    const room = documentRoomName(records.projectId, records.documentId);
    const memberProvider = createProvider(room, records.memberToken);
    const outsiderProvider = createProvider(room, records.outsiderToken);

    await expect(waitForAuthenticated(memberProvider)).resolves.toBe("read-write");
    await expect(waitForAuthenticationFailed(outsiderProvider)).resolves.toBe("permission-denied");
  });

  it("keeps document rooms isolated by project and document id", async () => {
    const allowed = await userCanAccessDocument(pool, records.memberId, records.projectId, records.documentId);
    const wrongProject = await userCanAccessDocument(pool, records.memberId, records.otherProjectId, records.documentId);
    const wrongDocument = await userCanAccessDocument(pool, records.memberId, records.projectId, records.otherDocumentId);

    expect(allowed).toBe(true);
    expect(wrongProject).toBe(false);
    expect(wrongDocument).toBe(false);
  });

  it("syncs two clients in one room and persists durable Yjs state", async () => {
    const room = documentRoomName(records.projectId, records.documentId);
    const first = createProvider(room, records.memberToken);
    const second = createProvider(room, records.memberToken);

    await Promise.all([waitForSynced(first), waitForSynced(second)]);

    const firstMap = first.document.getMap("content");
    const secondMap = second.document.getMap("content");
    firstMap.set("title", "Live draft");

    await waitFor(() => secondMap.get("title") === "Live draft");
    await waitForStoredState(records.documentId);
    const stored = await fetchDocumentState(pool, records.documentId);

    expect(Buffer.isBuffer(stored)).toBe(true);
    expect(stored.length).toBeGreaterThan(0);
  });

  it("loads persisted Yjs state after reconnect", async () => {
    const room = documentRoomName(records.projectId, records.documentId);
    const seed = new Y.Doc();
    seed.getMap("content").set("title", "Persisted title");
    await storeDocumentState(pool, records.documentId, Y.encodeStateAsUpdate(seed));

    const provider = createProvider(room, records.memberToken);
    await waitForSynced(provider);

    expect(provider.document.getMap("content").get("title")).toBe("Persisted title");
  });

  function createProvider(room, token) {
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${port}/documents`,
      name: room,
      token,
      document: new Y.Doc(),
    });
    providers.push(provider);
    return provider;
  }

  async function waitForStoredState(documentId) {
    await waitFor(async () => {
      const state = await fetchDocumentState(pool, documentId);
      return Boolean(state?.length);
    }, 7000);
  }
});

async function assertCollaborationMigration(pool) {
  const result = await pool.query("SELECT to_regclass('workspace_collaboration_states') AS table_name");
  if (!result.rows[0]?.table_name) {
    throw new Error("Migration 022_workspace_collaboration_states.sql must be applied before collaboration tests");
  }
}

async function createRecords(pool) {
  const suffix = crypto.randomUUID();
  const member = await insertUser(pool, `collab.member.${suffix}@example.com`, "Collaboration Member");
  const outsider = await insertUser(pool, `collab.outsider.${suffix}@example.com`, "Collaboration Outsider");
  const project = await insertProject(pool, member.id, "Collaboration Project");
  const otherProject = await insertProject(pool, member.id, "Other Collaboration Project");
  await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Team Member')", [project.id, member.id]);
  const document = await insertDocument(pool, project.id, member.id, "Shared Document");
  const otherDocument = await insertDocument(pool, otherProject.id, member.id, "Other Document");

  return {
    memberId: member.id,
    outsiderId: outsider.id,
    memberToken: createToken(member.id),
    outsiderToken: createToken(outsider.id),
    projectId: project.id,
    otherProjectId: otherProject.id,
    documentId: document.id,
    otherDocumentId: otherDocument.id,
  };
}

async function insertUser(pool, email, name) {
  const result = await pool.query("INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email", [name, email]);
  return result.rows[0];
}

async function insertProject(pool, leadId, name) {
  const result = await pool.query(
    `
    INSERT INTO projects (code, name, description, project_lead_id, start_date, end_date, status)
    VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'Planning')
    RETURNING id
    `,
    ["PRJ-2026-001", name, `${name} description`, leadId],
  );
  return result.rows[0];
}

async function insertDocument(pool, projectId, userId, name) {
  const result = await pool.query(
    `
    INSERT INTO workspace_documents (project_id, name, content, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING id
    `,
    [projectId, name, JSON.stringify({ type: "doc", content: [] }), userId],
  );
  return result.rows[0];
}

function createToken(userId, exp = Math.floor(Date.now() / 1000) + 3600) {
  const payload = JSON.stringify({ sub: String(userId), email: "user@example.com", exp });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function waitForAuthenticated(provider) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for authentication")), 5000);
    provider.on("authenticated", ({ scope }) => {
      clearTimeout(timer);
      resolve(scope);
    });
    provider.on("authenticationFailed", ({ reason }) => {
      clearTimeout(timer);
      reject(new Error(reason));
    });
  });
}

function waitForAuthenticationFailed(provider) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for authentication failure")), 5000);
    provider.on("authenticationFailed", ({ reason }) => {
      clearTimeout(timer);
      resolve(reason);
    });
    provider.on("authenticated", () => {
      clearTimeout(timer);
      reject(new Error("Expected authentication to fail"));
    });
  });
}

function waitForSynced(provider) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for sync")), 5000);
    provider.on("synced", ({ state }) => {
      if (state) {
        clearTimeout(timer);
        resolve();
      }
    });
    provider.on("authenticationFailed", ({ reason }) => {
      clearTimeout(timer);
      reject(new Error(reason));
    });
  });
}

async function waitFor(assertion, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition");
}
