from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession
from app.dependencies import get_authenticated_db_session


router = APIRouter(tags=["my-work"])

TaskRelationship = Literal["owner", "supporter", "owner_supporter"]


class MyWorkItemResponse(BaseModel):
    task_id: UUID
    task_name: str
    project_id: UUID
    project_name: str
    project_code: str
    phase_id: UUID
    phase_name: str
    due_date: date | None
    status: str
    relationship: TaskRelationship
    overdue: bool
    action_label: str | None


@router.get("/my-work", response_model=list[MyWorkItemResponse])
def list_my_work(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[MyWorkItemResponse]:
    rows = session.fetch_all(
        """
        SELECT
          tasks.id AS task_id,
          tasks.name AS task_name,
          projects.id AS project_id,
          projects.name AS project_name,
          projects.code AS project_code,
          phases.id AS phase_id,
          phases.name AS phase_name,
          tasks.due_date,
          tasks.status,
          CASE
            WHEN tasks.owner_id = %s AND task_supporters.user_id IS NOT NULL THEN 'owner_supporter'
            WHEN tasks.owner_id = %s THEN 'owner'
            ELSE 'supporter'
          END AS relationship,
          COALESCE(tasks.due_date < CURRENT_DATE AND tasks.status <> 'Completed', FALSE) AS overdue,
          CASE
            WHEN tasks.due_date < CURRENT_DATE AND tasks.status <> 'Completed' THEN 'Overdue'
            WHEN tasks.status = 'Blocked' THEN 'Unblock task'
            WHEN tasks.due_date = CURRENT_DATE AND tasks.status <> 'Completed' THEN 'Due today'
            ELSE NULL
          END AS action_label
        FROM tasks
        JOIN phases
          ON phases.id = tasks.phase_id
        JOIN projects
          ON projects.id = phases.project_id
        JOIN project_members
          ON project_members.project_id = projects.id
         AND project_members.user_id = %s
        LEFT JOIN task_supporters
          ON task_supporters.task_id = tasks.id
         AND task_supporters.user_id = %s
        WHERE projects.archived_at IS NULL
          AND phases.archived_at IS NULL
          AND (
            tasks.owner_id = %s
            OR task_supporters.user_id IS NOT NULL
          )
        ORDER BY
          COALESCE(tasks.due_date < CURRENT_DATE AND tasks.status <> 'Completed', FALSE) DESC,
          (tasks.status = 'Completed') ASC,
          tasks.due_date ASC NULLS LAST,
          tasks.created_at ASC,
          tasks.id ASC
        """,
        (
            current_user.id,
            current_user.id,
            current_user.id,
            current_user.id,
            current_user.id,
        ),
    )
    return [MyWorkItemResponse(**row) for row in rows]
