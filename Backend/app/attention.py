from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession
from app.dependencies import get_authenticated_db_session


router = APIRouter(tags=["attention"])

AttentionType = Literal["project", "phase", "task"]
AttentionSeverity = Literal["Needs attention", "At risk"]


class AssignedPersonResponse(BaseModel):
    id: UUID
    name: str
    email: str


class AttentionItemResponse(BaseModel):
    type: AttentionType
    reason: str
    project_id: UUID
    project_name: str
    project_code: str
    phase_id: UUID | None
    phase_name: str | None
    task_id: UUID | None
    task_name: str | None
    assigned_person: AssignedPersonResponse | None
    due_date: date | None
    severity: AttentionSeverity


@router.get("/attention", response_model=list[AttentionItemResponse])
def list_attention(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[AttentionItemResponse]:
    rows = session.fetch_all(
        """
        WITH current_memberships AS (
          SELECT project_id, role
          FROM project_members
          WHERE user_id = %(user_id)s
        ),
        project_attention AS (
          SELECT
            'project'::TEXT AS type,
            CASE
              WHEN project_health.health = 'Delayed' THEN 'Project deadline has passed'
              ELSE project_health.name || ' needs attention'
            END AS reason,
            project_health.id AS project_id,
            project_health.name AS project_name,
            project_health.code AS project_code,
            NULL::UUID AS phase_id,
            NULL::TEXT AS phase_name,
            NULL::UUID AS task_id,
            NULL::TEXT AS task_name,
            NULL::UUID AS assigned_person_id,
            NULL::TEXT AS assigned_person_name,
            NULL::TEXT AS assigned_person_email,
            project_health.end_date AS due_date,
            CASE
              WHEN project_health.health = 'Delayed' THEN 'At risk'
              ELSE 'Needs attention'
            END AS severity,
            2 AS sort_group
          FROM project_health
          JOIN current_memberships
            ON current_memberships.project_id = project_health.id
          WHERE project_health.archived_at IS NULL
            AND project_health.health IN ('Delayed', 'At Risk')
        ),
        budget_attention AS (
          SELECT
            'project'::TEXT AS type,
            'Project budget is over allocated amount' AS reason,
            projects.id AS project_id,
            projects.name AS project_name,
            projects.code AS project_code,
            NULL::UUID AS phase_id,
            NULL::TEXT AS phase_name,
            NULL::UUID AS task_id,
            NULL::TEXT AS task_name,
            NULL::UUID AS assigned_person_id,
            NULL::TEXT AS assigned_person_name,
            NULL::TEXT AS assigned_person_email,
            NULL::DATE AS due_date,
            'At risk' AS severity,
            2 AS sort_group
          FROM projects
          JOIN current_memberships
            ON current_memberships.project_id = projects.id
          WHERE projects.archived_at IS NULL
            AND projects.budget_allocated > 0
            AND projects.budget_spent > projects.budget_allocated
            AND current_memberships.role IN ('PM', 'Finance')
        ),
        phase_attention AS (
          SELECT
            'phase'::TEXT AS type,
            phases.name || ' is behind schedule' AS reason,
            projects.id AS project_id,
            projects.name AS project_name,
            projects.code AS project_code,
            phases.id AS phase_id,
            phases.name AS phase_name,
            NULL::UUID AS task_id,
            NULL::TEXT AS task_name,
            users.id AS assigned_person_id,
            users.name AS assigned_person_name,
            users.email AS assigned_person_email,
            phases.end_date AS due_date,
            'Needs attention' AS severity,
            1 AS sort_group
          FROM phases
          JOIN projects
            ON projects.id = phases.project_id
          JOIN current_memberships
            ON current_memberships.project_id = projects.id
          LEFT JOIN users
            ON users.id = phases.owner_id
          WHERE projects.archived_at IS NULL
            AND phases.archived_at IS NULL
            AND phases.end_date < CURRENT_DATE
            AND phases.status <> 'Completed'
            AND (
              current_memberships.role = 'PM'
              OR EXISTS (
                SELECT 1
                FROM phase_members
                WHERE phase_members.phase_id = phases.id
                  AND phase_members.user_id = %(user_id)s
              )
            )
        ),
        task_attention AS (
          SELECT
            'task'::TEXT AS type,
            CASE
              WHEN tasks.due_date < CURRENT_DATE AND tasks.status = 'Blocked' THEN tasks.name || ' is overdue and blocked'
              WHEN tasks.due_date < CURRENT_DATE THEN tasks.name || ' is overdue'
              ELSE tasks.name || ' is blocked'
            END AS reason,
            projects.id AS project_id,
            projects.name AS project_name,
            projects.code AS project_code,
            phases.id AS phase_id,
            phases.name AS phase_name,
            tasks.id AS task_id,
            tasks.name AS task_name,
            users.id AS assigned_person_id,
            users.name AS assigned_person_name,
            users.email AS assigned_person_email,
            tasks.due_date,
            'Needs attention' AS severity,
            0 AS sort_group
          FROM tasks
          JOIN phases
            ON phases.id = tasks.phase_id
          JOIN projects
            ON projects.id = phases.project_id
          JOIN current_memberships
            ON current_memberships.project_id = projects.id
          JOIN users
            ON users.id = tasks.owner_id
          LEFT JOIN task_supporters
            ON task_supporters.task_id = tasks.id
           AND task_supporters.user_id = %(user_id)s
          WHERE projects.archived_at IS NULL
            AND phases.archived_at IS NULL
            AND (
              (tasks.due_date < CURRENT_DATE AND tasks.status <> 'Completed')
              OR tasks.status = 'Blocked'
            )
            AND (
              current_memberships.role = 'PM'
              OR tasks.owner_id = %(user_id)s
              OR task_supporters.user_id IS NOT NULL
            )
        )
        SELECT *
        FROM (
          SELECT *
          FROM task_attention
          UNION ALL
          SELECT *
          FROM phase_attention
          UNION ALL
          SELECT *
          FROM project_attention
          UNION ALL
          SELECT *
          FROM budget_attention
        ) AS attention_items
        ORDER BY
          sort_group,
          CASE WHEN severity = 'Needs attention' THEN 0 ELSE 1 END,
          due_date ASC NULLS LAST,
          reason,
          project_id
        """,
        {"user_id": current_user.id},
    )

    return [
        AttentionItemResponse(
            type=row["type"],
            reason=row["reason"],
            project_id=row["project_id"],
            project_name=row["project_name"],
            project_code=row["project_code"],
            phase_id=row["phase_id"],
            phase_name=row["phase_name"],
            task_id=row["task_id"],
            task_name=row["task_name"],
            assigned_person=assigned_person_from_row(row),
            due_date=row["due_date"],
            severity=row["severity"],
        )
        for row in rows
    ]


def assigned_person_from_row(row) -> AssignedPersonResponse | None:
    if row["assigned_person_id"] is None:
        return None

    return AssignedPersonResponse(
        id=row["assigned_person_id"],
        name=row["assigned_person_name"],
        email=row["assigned_person_email"],
    )
