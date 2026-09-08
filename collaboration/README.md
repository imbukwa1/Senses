# SENSES Collaboration Service

This package is an isolated Phase 3 collaboration foundation. It does not wire the production Workspace document or spreadsheet editors into collaborative mode.

## Documents

- Hocuspocus v4 hosts document WebSocket rooms.
- Room names are project-scoped: `project:{project_id}:documents:{document_id}`.
- The WebSocket handshake verifies the existing SENSES bearer token format, confirms the user exists, confirms project membership, and confirms the document belongs to the requested project.
- Durable Yjs updates are stored additively in `workspace_collaboration_states`.
- Existing `workspace_documents.content JSONB` remains the Phase 2 snapshot/fallback/export state.

## Spreadsheets

- Spreadsheet collaboration must use the official Univer collaboration service/client stack.
- This package does not implement a custom Univer/Yjs workbook adapter and does not synchronize whole workbook JSON over WebSockets.
- Backend collaboration session discovery exposes the project-scoped room identity and configured official Univer endpoint only after existing project/resource access checks pass.

## Runtime Configuration

Use Node 22+ for Hocuspocus v4.

Required for the document service:

```text
AUTH_TOKEN_SECRET=
DATABASE_URL= or COLLABORATION_DATABASE_URL=
DOCUMENT_COLLABORATION_HOST=127.0.0.1
DOCUMENT_COLLABORATION_PORT=1234
DOCUMENT_COLLABORATION_PATH=/documents
COLLABORATION_HEALTH_PORT=1235
```

If the database password contains special URL characters such as `#`, set `COLLABORATION_DATABASE_URL` with a percent-encoded password, for example `%23`.

Required before multi-instance deployment:

```text
SHARED_COORDINATION_URL=redis://host:6379/0
```

Required before spreadsheet collaboration:

```text
UNIVER_COLLABORATION_ENDPOINT=
UNIVER_COLLABORATION_HEALTH_URL=
```

## Autosave Safety

The Phase 2 editors still use the existing 800ms JSON autosave. Do not enable production CRDT editing while also writing independent debounced JSON snapshots from editor clients. When collaborative editing is wired later, CRDT persistence must become the source for live state, with controlled checkpoint/export updates to the existing JSONB snapshots.
