from __future__ import annotations

from base64 import b64encode
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from psycopg.types.json import Jsonb

from app.access import ensure_project_access, ensure_project_pm
from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession, Row
from app.dependencies import get_authenticated_db_session
from app.projects import (
    fetch_workspace_document_or_404,
    fetch_workspace_spreadsheet_or_404,
)

router = APIRouter(prefix="/projects", tags=["workspace versions"])
ResourceType = Literal["documents", "spreadsheets"]


class WorkspaceRevisionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str | None = Field(default=None, min_length=1, max_length=200)


class WorkspaceRevisionResponse(BaseModel):
    id: UUID
    project_id: UUID
    resource_type: Literal["document", "spreadsheet"]
    resource_id: UUID
    label: str | None
    created_by: UUID | None
    created_at: datetime
    has_json_snapshot: bool
    has_collaboration_snapshot: bool
    snapshot: dict | None = None
    yjs_state_base64: str | None = None


def _table(resource_type: ResourceType) -> tuple[str, Literal["document", "spreadsheet"]]:
    if resource_type == "documents":
        return "workspace_documents", "document"
    if resource_type == "spreadsheets":
        return "workspace_spreadsheets", "spreadsheet"
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace resource not found")


def _resource(session: DatabaseSession, project_id: UUID, resource_type: ResourceType, resource_id: UUID) -> Row:
    table, _ = _table(resource_type)
    if table == "workspace_documents":
        return fetch_workspace_document_or_404(session, project_id, resource_id)
    return fetch_workspace_spreadsheet_or_404(session, project_id, resource_id)


def _revision_response(row: Row) -> WorkspaceRevisionResponse:
    state = row.get("yjs_state")
    return WorkspaceRevisionResponse(
        id=row["id"],
        project_id=row["project_id"],
        resource_type=row["resource_type"],
        resource_id=row["resource_id"],
        label=row["label"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        has_json_snapshot=row["snapshot"] is not None,
        has_collaboration_snapshot=state is not None,
        snapshot=row["snapshot"],
        yjs_state_base64=b64encode(bytes(state)).decode("ascii") if state is not None else None,
    )


@router.get("/{project_id}/workspace/{resource_type}/{resource_id}/versions", response_model=list[WorkspaceRevisionResponse])
def list_workspace_versions(
    project_id: UUID,
    resource_type: ResourceType,
    resource_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[WorkspaceRevisionResponse]:
    ensure_project_access(session, current_user.id, project_id)
    _resource(session, project_id, resource_type, resource_id)
    _table(resource_type)
    rows = session.fetch_all(
        """
        SELECT id, project_id, resource_type, resource_id, label, created_by, created_at,
               snapshot, yjs_state
        FROM workspace_resource_revisions
        WHERE project_id = %s AND resource_type = %s AND resource_id = %s
        ORDER BY created_at DESC, id DESC
        """,
        (project_id, "document" if resource_type == "documents" else "spreadsheet", resource_id),
    )
    return [_revision_response(row) for row in rows]


@router.get("/{project_id}/workspace/{resource_type}/{resource_id}/versions/{revision_id}", response_model=WorkspaceRevisionResponse)
def view_workspace_version(
    project_id: UUID,
    resource_type: ResourceType,
    resource_id: UUID,
    revision_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceRevisionResponse:
    ensure_project_access(session, current_user.id, project_id)
    resource = _resource(session, project_id, resource_type, resource_id)
    row = session.fetch_one(
        """
        SELECT id, project_id, resource_type, resource_id, label, created_by, created_at,
               snapshot, yjs_state
        FROM workspace_resource_revisions
        WHERE project_id = %s AND resource_type = %s AND resource_id = %s AND id = %s
        """,
        (project_id, "document" if resource_type == "documents" else "spreadsheet", resource_id, revision_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace version not found")
    return _revision_response(row)


@router.post("/{project_id}/workspace/{resource_type}/{resource_id}/versions", response_model=WorkspaceRevisionResponse, status_code=status.HTTP_201_CREATED)
def create_workspace_version(
    project_id: UUID,
    resource_type: ResourceType,
    resource_id: UUID,
    payload: WorkspaceRevisionCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceRevisionResponse:
    ensure_project_access(session, current_user.id, project_id)
    _resource(session, project_id, resource_type, resource_id)
    resource_kind = "document" if resource_type == "documents" else "spreadsheet"
    if resource_kind == "document":
        state = session.fetch_one(
            "SELECT yjs_state FROM workspace_collaboration_states WHERE resource_type = 'document' AND resource_id = %s",
            (resource_id,),
        )
        if state is not None:
            row = session.fetch_one(
                """
                INSERT INTO workspace_resource_revisions
                  (project_id, resource_type, resource_id, yjs_state, label, created_by)
                VALUES (%s, 'document', %s, %s, %s, %s)
                RETURNING id, project_id, resource_type, resource_id, label, created_by, created_at, snapshot, yjs_state
                """,
                (project_id, resource_id, state["yjs_state"], payload.label, current_user.id),
            )
        else:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No synchronized document checkpoint is available")
    else:
        resource = _resource(session, project_id, resource_type, resource_id)
        if resource.get("univer_unit_id"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Collaborative spreadsheet checkpoint requires the official Univer snapshot state",
            )
        row = session.fetch_one(
            """
            INSERT INTO workspace_resource_revisions
              (project_id, resource_type, resource_id, snapshot, label, created_by)
            VALUES (%s, 'spreadsheet', %s, %s, %s, %s)
            RETURNING id, project_id, resource_type, resource_id, label, created_by, created_at, snapshot, yjs_state
            """,
            (project_id, resource_id, Jsonb(resource["content"]), payload.label, current_user.id),
        )
    return _revision_response(row)


@router.post("/{project_id}/workspace/{resource_type}/{resource_id}/versions/{revision_id}/restore", response_model=WorkspaceRevisionResponse)
def restore_workspace_version(
    project_id: UUID,
    resource_type: ResourceType,
    resource_id: UUID,
    revision_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceRevisionResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    resource = _resource(session, project_id, resource_type, resource_id)
    resource_kind = "document" if resource_type == "documents" else "spreadsheet"
    row = session.fetch_one(
        """
        SELECT id, project_id, resource_type, resource_id, label, created_by, created_at, snapshot, yjs_state
        FROM workspace_resource_revisions
        WHERE project_id = %s AND resource_type = %s AND resource_id = %s AND id = %s
        """,
        (project_id, resource_kind, resource_id, revision_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace version not found")
    if resource_kind == "spreadsheet":
        if resource.get("univer_unit_id"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Collaborative spreadsheet restore requires the official Univer session to apply the state",
            )
        advanced = session.fetch_one(
            """
            INSERT INTO workspace_resource_revisions
              (project_id, resource_type, resource_id, snapshot, label, created_by)
            VALUES (%s, 'spreadsheet', %s, %s, %s, %s)
            RETURNING id, project_id, resource_type, resource_id, label, created_by, created_at, snapshot, yjs_state
            """,
            (project_id, resource_id, Jsonb(row["snapshot"]), f"Restored from {row['id']}", current_user.id),
        )
        session.execute(
            "UPDATE workspace_spreadsheets SET content = %s WHERE project_id = %s AND id = %s",
            (Jsonb(row["snapshot"]), project_id, resource_id),
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Collaborative document restore requires the Hocuspocus session to apply the state",
        )

        # Kept unreachable intentionally until the collaboration service can
        # apply and broadcast the restored Yjs update to active clients.
        advanced = session.fetch_one(
            """
            INSERT INTO workspace_resource_revisions
              (project_id, resource_type, resource_id, yjs_state, label, created_by)
            VALUES (%s, 'document', %s, %s, %s, %s)
            RETURNING id, project_id, resource_type, resource_id, label, created_by, created_at, snapshot, yjs_state
            """,
            (project_id, resource_id, row["yjs_state"], f"Restored from {row['id']}", current_user.id),
        )
        session.execute(
            """
            INSERT INTO workspace_collaboration_states (resource_type, resource_id, yjs_state)
            VALUES ('document', %s, %s)
            ON CONFLICT (resource_type, resource_id) DO UPDATE SET yjs_state = EXCLUDED.yjs_state
            """,
            (resource_id, row["yjs_state"]),
        )
    return _revision_response(advanced)
