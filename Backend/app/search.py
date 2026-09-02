from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession, Row
from app.dependencies import get_authenticated_db_session


router = APIRouter(prefix="/search", tags=["search"])

SearchResultType = Literal["project", "phase", "task"]


class SearchResultResponse(BaseModel):
    result_type: SearchResultType
    project_id: UUID
    project_code: str
    project_name: str
    phase_id: UUID | None
    phase_name: str | None
    task_id: UUID | None
    task_name: str | None
    status: str
    created_at: datetime
    updated_at: datetime


@router.get("", response_model=list[SearchResultResponse])
def search_records(
    q: str = Query(...),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[SearchResultResponse]:
    return [
        search_result_to_response(row)
        for row in fetch_accessible_search_results(session, current_user.id, q)
    ]


def fetch_accessible_search_results(
    session: DatabaseSession,
    user_id: UUID,
    query: str,
) -> list[Row]:
    return session.fetch_all(
        """
        SELECT search_results.*
        FROM search_project_phase_task_records(%s) AS search_results
        JOIN project_members
          ON project_members.project_id = search_results.project_id
        WHERE project_members.user_id = %s
        ORDER BY search_results.result_type, search_results.created_at DESC
        """,
        (query, user_id),
    )


def search_result_to_response(row: Row) -> SearchResultResponse:
    return SearchResultResponse(**row)
