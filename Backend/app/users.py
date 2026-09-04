from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr

from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession, Row
from app.dependencies import get_authenticated_db_session


router = APIRouter(prefix="/users", tags=["users"])

USER_LOOKUP_LIMIT = 20


class UserLookupResponse(BaseModel):
    id: UUID
    name: str
    email: EmailStr


@router.get("", response_model=list[UserLookupResponse])
def search_users(
    search: str = Query(default=""),
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[UserLookupResponse]:
    del current_user
    query = search.strip()
    if not query:
        return []

    return [user_lookup_to_response(row) for row in fetch_matching_users(session, query)]


def fetch_matching_users(session: DatabaseSession, query: str) -> list[Row]:
    pattern = f"%{query}%"
    return session.fetch_all(
        """
        SELECT id, name, email
        FROM users
        WHERE name ILIKE %s
           OR email ILIKE %s
        ORDER BY name, email, id
        LIMIT %s
        """,
        (pattern, pattern, USER_LOOKUP_LIMIT),
    )


def user_lookup_to_response(row: Row) -> UserLookupResponse:
    return UserLookupResponse(**row)
