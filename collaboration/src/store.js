import pg from "pg";

const { Pool } = pg;

export function createPool(databaseUrl) {
  if (!databaseUrl || !databaseUrl.includes("@")) {
    throw new Error("DATABASE_URL must be a complete PostgreSQL URL for the collaboration service");
  }

  return new Pool(parseDatabaseConfig(databaseUrl));
}

export function parseDatabaseConfig(databaseUrl) {
  const match = /^(postgres(?:ql)?:)\/\/([^:]+):(.+)@([^:/]+)(?::(\d+))?\/(.+)$/.exec(databaseUrl);
  if (!match) {
    return { connectionString: databaseUrl };
  }

  return {
    user: decodeURIComponent(match[2]),
    password: decodeURIComponent(match[3]),
    host: match[4],
    port: match[5] ? Number(match[5]) : undefined,
    database: decodeURIComponent(match[6].split("?")[0]),
    connectionString: undefined,
  };
}

export async function fetchUser(pool, userId) {
  const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [userId]);
  return result.rows[0] ?? null;
}

export async function userCanAccessDocument(pool, userId, projectId, documentId) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM workspace_documents
      JOIN projects
        ON projects.id = workspace_documents.project_id
      JOIN project_members
        ON project_members.project_id = workspace_documents.project_id
       AND project_members.user_id = $1
      WHERE workspace_documents.project_id = $2
        AND workspace_documents.id = $3
        AND projects.archived_at IS NULL
    ) AS can_access
    `,
    [userId, projectId, documentId],
  );
  return Boolean(result.rows[0]?.can_access);
}

export async function fetchDocumentState(pool, resourceId) {
  const result = await pool.query(
    `
    SELECT yjs_state
    FROM workspace_collaboration_states
    WHERE resource_type = 'document'
      AND resource_id = $1
    `,
    [resourceId],
  );
  return result.rows[0]?.yjs_state ?? null;
}

export async function storeDocumentState(pool, resourceId, state) {
  await pool.query(
    `
    INSERT INTO workspace_collaboration_states (resource_type, resource_id, yjs_state)
    VALUES ('document', $1, $2)
    ON CONFLICT (resource_type, resource_id)
    DO UPDATE SET yjs_state = EXCLUDED.yjs_state
    `,
    [resourceId, Buffer.from(state)],
  );
  await pool.query(
    `
    INSERT INTO workspace_resource_revisions
      (project_id, resource_type, resource_id, yjs_state)
    SELECT project_id, 'document', id, $2
    FROM workspace_documents
    WHERE id = $1
    `,
    [resourceId, Buffer.from(state)],
  );
}

export async function pingDatabase(pool) {
  await pool.query("SELECT 1");
}
