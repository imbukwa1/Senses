from datetime import datetime
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession
from app.dependencies import get_authenticated_db_session

router = APIRouter(prefix="/calendar", tags=["calendar"])


class CalendarEventColor(str, Enum):
    blue = "blue"
    green = "green"
    red = "red"
    amber = "amber"
    purple = "purple"
    teal = "teal"


class CalendarEventPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    color: CalendarEventColor = CalendarEventColor.blue

    @model_validator(mode="after")
    def validate_times(self) -> "CalendarEventPayload":
        if not self.title.strip():
            raise ValueError("Event title is required")
        if self.end_at <= self.start_at:
            raise ValueError("Event end must be after event start")
        return self


class CalendarEventResponse(CalendarEventPayload):
    id: UUID
    created_by: UUID
    creator_name: str
    created_at: datetime
    updated_at: datetime


def event_response(row: dict) -> CalendarEventResponse:
    return CalendarEventResponse(**row)


@router.get("/events", response_model=list[CalendarEventResponse])
def list_calendar_events(
    start: datetime | None = None,
    end: datetime | None = None,
    _current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[CalendarEventResponse]:
    if start is not None and end is not None and end <= start:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Calendar range end must be after range start")
    conditions = []
    params: list[object] = []
    if start is not None:
        conditions.append("events.end_at > %s")
        params.append(start)
    if end is not None:
        conditions.append("events.start_at < %s")
        params.append(end)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = session.fetch_all(
        f"""
        SELECT events.id, events.title, events.description, events.start_at, events.end_at,
               events.all_day, events.color, events.created_by, users.name AS creator_name,
               events.created_at, events.updated_at
        FROM calendar_events AS events
        JOIN users ON users.id = events.created_by
        {where}
        ORDER BY events.start_at, events.end_at, events.created_at, events.id
        """,
        params,
    )
    return [event_response(row) for row in rows]


@router.post("/events", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
def create_calendar_event(
    payload: CalendarEventPayload,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> CalendarEventResponse:
    row = session.fetch_one(
        """
        INSERT INTO calendar_events (title, description, start_at, end_at, all_day, color, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (payload.title.strip(), payload.description, payload.start_at, payload.end_at, payload.all_day, payload.color.value, current_user.id),
    )
    return event_response(fetch_calendar_event(session, row["id"]))


@router.patch("/events/{event_id}", response_model=CalendarEventResponse)
def update_calendar_event(
    event_id: UUID,
    payload: CalendarEventPayload,
    _current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> CalendarEventResponse:
    ensure_calendar_event(session, event_id)
    session.execute(
        """
        UPDATE calendar_events
        SET title = %s, description = %s, start_at = %s, end_at = %s,
            all_day = %s, color = %s, updated_at = NOW()
        WHERE id = %s
        """,
        (payload.title.strip(), payload.description, payload.start_at, payload.end_at, payload.all_day, payload.color.value, event_id),
    )
    return event_response(fetch_calendar_event(session, event_id))


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calendar_event(
    event_id: UUID,
    _current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> None:
    ensure_calendar_event(session, event_id)
    session.execute("DELETE FROM calendar_events WHERE id = %s", (event_id,))


def ensure_calendar_event(session: DatabaseSession, event_id: UUID) -> None:
    if fetch_calendar_event(session, event_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")


def fetch_calendar_event(session: DatabaseSession, event_id: UUID) -> dict:
    row = session.fetch_one(
        """
        SELECT events.id, events.title, events.description, events.start_at, events.end_at,
               events.all_day, events.color, events.created_by, users.name AS creator_name,
               events.created_at, events.updated_at
        FROM calendar_events AS events
        JOIN users ON users.id = events.created_by
        WHERE events.id = %s
        """,
        (event_id,),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
    return row
