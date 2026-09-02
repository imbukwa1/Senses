from collections.abc import Iterator
from uuid import UUID

from fastapi import Request

from app.db import Database, DatabaseSession


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_db_session(request: Request) -> Iterator[DatabaseSession]:
    database = get_database(request)
    with database.session() as session:
        yield session


def db_session_with_actor(
    request: Request,
    actor_user_id: UUID | str | None = None,
) -> Iterator[DatabaseSession]:
    database = get_database(request)
    with database.session(actor_user_id=actor_user_id) as session:
        yield session
