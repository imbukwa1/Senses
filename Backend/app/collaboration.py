from __future__ import annotations

import json
from dataclasses import dataclass
from socket import create_connection
from typing import Literal
from urllib.parse import urlparse
from urllib.error import URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.access import ensure_project_access
from app.auth import AuthenticatedUser, get_current_user
from app.config import Settings
from app.db import DatabaseSession
from app.dependencies import get_authenticated_db_session
from app.projects import fetch_workspace_document_or_404, fetch_workspace_spreadsheet_or_404


router = APIRouter(prefix="/collaboration", tags=["collaboration"])


class CollaborationServiceCheck(BaseModel):
    configured: bool
    reachable: bool
    required: list[str]
    url: str | None = None
    detail: str | None = None


class CollaborationReadinessResponse(BaseModel):
    ready: bool
    documents: CollaborationServiceCheck
    univer: CollaborationServiceCheck
    shared_coordination: CollaborationServiceCheck


class CollaborationSessionResponse(BaseModel):
    resource_type: Literal["document", "spreadsheet"]
    project_id: UUID
    resource_id: UUID
    room: str
    endpoint: str | None
    unit_id: str | None = None
    ready: bool
    service: CollaborationServiceCheck


@dataclass(frozen=True)
class ReachabilityResult:
    reachable: bool
    detail: str | None = None


@router.get("/readiness", response_model=CollaborationReadinessResponse)
def collaboration_readiness(request: Request) -> CollaborationReadinessResponse:
    settings: Settings = request.app.state.settings
    documents = collaboration_service_check(
        url=settings.document_collaboration_health_url,
        required=["DOCUMENT_COLLABORATION_HEALTH_URL", "DOCUMENT_COLLABORATION_WS_URL"],
        configured=bool(settings.document_collaboration_health_url and settings.document_collaboration_ws_url),
    )
    univer = collaboration_service_check(
        url=settings.univer_collaboration_health_url,
        required=["UNIVER_COLLABORATION_ENDPOINT", "UNIVER_COLLABORATION_HEALTH_URL"],
        configured=bool(settings.univer_collaboration_endpoint and settings.univer_collaboration_health_url),
    )
    coordination = coordination_reachable(settings.shared_coordination_url)
    shared_coordination = CollaborationServiceCheck(
        configured=bool(settings.shared_coordination_url),
        reachable=coordination.reachable,
        required=["SHARED_COORDINATION_URL"],
        url=settings.shared_coordination_url,
        detail=coordination.detail,
    )
    return CollaborationReadinessResponse(
        ready=documents.reachable and univer.reachable and shared_coordination.reachable,
        documents=documents,
        univer=univer,
        shared_coordination=shared_coordination,
    )


@router.get("/projects/{project_id}/documents/{document_id}/session", response_model=CollaborationSessionResponse)
def document_collaboration_session(
    request: Request,
    project_id: UUID,
    document_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> CollaborationSessionResponse:
    ensure_project_access(session, current_user.id, project_id)
    fetch_workspace_document_or_404(session, project_id, document_id)
    settings: Settings = request.app.state.settings
    service = collaboration_service_check(
        url=settings.document_collaboration_health_url,
        required=["DOCUMENT_COLLABORATION_HEALTH_URL", "DOCUMENT_COLLABORATION_WS_URL"],
        configured=bool(settings.document_collaboration_health_url and settings.document_collaboration_ws_url),
    )
    return CollaborationSessionResponse(
        resource_type="document",
        project_id=project_id,
        resource_id=document_id,
        room=f"project:{project_id}:documents:{document_id}",
        endpoint=settings.document_collaboration_ws_url,
        ready=service.reachable,
        service=service,
    )


@router.get("/projects/{project_id}/spreadsheets/{spreadsheet_id}/session", response_model=CollaborationSessionResponse)
def spreadsheet_collaboration_session(
    request: Request,
    project_id: UUID,
    spreadsheet_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> CollaborationSessionResponse:
    ensure_project_access(session, current_user.id, project_id)
    spreadsheet = fetch_workspace_spreadsheet_or_404(session, project_id, spreadsheet_id)
    settings: Settings = request.app.state.settings
    service = collaboration_service_check(
        url=settings.univer_collaboration_health_url,
        required=["UNIVER_COLLABORATION_ENDPOINT", "UNIVER_COLLABORATION_HEALTH_URL"],
        configured=bool(settings.univer_collaboration_endpoint and settings.univer_collaboration_health_url),
    )
    return CollaborationSessionResponse(
        resource_type="spreadsheet",
        project_id=project_id,
        resource_id=spreadsheet_id,
        room=f"project:{project_id}:spreadsheets:{spreadsheet_id}",
        endpoint=settings.univer_collaboration_endpoint,
        unit_id=spreadsheet.get("univer_unit_id"),
        ready=service.reachable,
        service=service,
    )


@router.post("/projects/{project_id}/spreadsheets/{spreadsheet_id}/unit", response_model=CollaborationSessionResponse)
def provision_spreadsheet_collaboration_unit(
    request: Request,
    project_id: UUID,
    spreadsheet_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> CollaborationSessionResponse:
    """Provision one official Univer unit after SENSES access checks."""
    ensure_project_access(session, current_user.id, project_id)
    spreadsheet = fetch_workspace_spreadsheet_or_404(session, project_id, spreadsheet_id)
    settings: Settings = request.app.state.settings
    service = collaboration_service_check(
        url=settings.univer_collaboration_health_url,
        required=["UNIVER_COLLABORATION_ENDPOINT", "UNIVER_COLLABORATION_HEALTH_URL"],
        configured=bool(settings.univer_collaboration_endpoint and settings.univer_collaboration_health_url),
    )
    if not settings.univer_collaboration_endpoint:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Univer collaboration service is not configured.")

    existing = session.fetch_one(
        "SELECT univer_unit_id FROM workspace_spreadsheets WHERE project_id = %s AND id = %s FOR UPDATE",
        (project_id, spreadsheet_id),
    )
    if existing and existing.get("univer_unit_id"):
        unit_id = existing["univer_unit_id"]
    else:
        unit_id = create_univer_sheet_unit(settings.univer_collaboration_endpoint, spreadsheet["name"], current_user.id)
        session.execute(
            "UPDATE workspace_spreadsheets SET univer_unit_id = %s WHERE project_id = %s AND id = %s AND univer_unit_id IS NULL",
            (unit_id, project_id, spreadsheet_id),
        )

    return CollaborationSessionResponse(
        resource_type="spreadsheet",
        project_id=project_id,
        resource_id=spreadsheet_id,
        room=f"project:{project_id}:spreadsheets:{spreadsheet_id}",
        endpoint=settings.univer_collaboration_endpoint,
        unit_id=unit_id,
        ready=service.reachable,
        service=service,
    )


def create_univer_sheet_unit(endpoint: str, name: str, creator: UUID) -> str:
    request = UrlRequest(
        f"{endpoint.rstrip('/')}/universer-api/snapshot/2/unit/-/create",
        data=json.dumps({"type": 2, "name": name, "creator": str(creator)}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode())
    except (OSError, URLError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Univer collaboration unit could not be created.") from exc
    # The official 0.25.x starter treats a non-empty unitID as success. The
    # server may include a nonzero informational error object in the same
    # response, so the unit ID is the authoritative creation result.
    unit_id = payload.get("unitID")
    if not unit_id:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Univer collaboration unit could not be created.")
    return str(unit_id)


def collaboration_service_check(url: str | None, required: list[str], configured: bool) -> CollaborationServiceCheck:
    if not configured or not url:
        return CollaborationServiceCheck(
            configured=False,
            reachable=False,
            required=required,
            url=url,
            detail="Collaboration service is not configured.",
        )
    reachability = service_reachable(url)
    return CollaborationServiceCheck(
        configured=True,
        reachable=reachability.reachable,
        required=required,
        url=url,
        detail=reachability.detail,
    )


def service_reachable(url: str) -> ReachabilityResult:
    try:
        request = UrlRequest(url, method="GET")
        with urlopen(request, timeout=2) as response:
            if 200 <= response.status < 300:
                return ReachabilityResult(reachable=True)
            return ReachabilityResult(reachable=False, detail=f"Service returned HTTP {response.status}.")
    except (OSError, URLError) as exc:
        return ReachabilityResult(reachable=False, detail=str(exc))


def coordination_reachable(url: str | None) -> ReachabilityResult:
    if not url:
        return ReachabilityResult(reachable=False, detail="Required for multi-instance collaboration deployment.")

    parsed = urlparse(url)
    if not parsed.hostname:
        return ReachabilityResult(reachable=False, detail="Shared coordination URL is malformed.")

    port = parsed.port or (6379 if parsed.scheme == "redis" else None)
    if port is None:
        return ReachabilityResult(reachable=False, detail="Shared coordination URL must include a port.")

    try:
        with create_connection((parsed.hostname, port), timeout=2):
            return ReachabilityResult(reachable=True)
    except OSError as exc:
        return ReachabilityResult(reachable=False, detail=str(exc))
