import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_authorized_user_can_add_comment_with_authenticated_author_and_database_timestamp() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Comment Author", _unique_email("comments.author"))
        other_user = _create_auth_user(database, "Other User", _unique_email("comments.other"))
        project = _create_project(database, user["id"], "Comment Project")
        phase = _create_phase(database, project["id"], user["id"], "Comment Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Comment Task")
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            blocked_override = client.post(
                _comments_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(token),
                json={
                    "comment": "Client tries to override author.",
                    "user_id": str(other_user["id"]),
                    "created_at": "2026-01-01T00:00:00Z",
                },
            )
            response = client.post(
                _comments_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(token),
                json={"comment": "This comment belongs to the authenticated user."},
            )
            body = response.json()

            with database.session() as session:
                stored = session.fetch_one(
                    """
                    SELECT task_id, user_id, comment, created_at, updated_at
                    FROM comments
                    WHERE id = %s
                    """,
                    (body["id"],),
                )
                audit = session.fetch_one(
                    """
                    SELECT user_id, new_values
                    FROM audit_logs
                    WHERE entity_type = 'comments'
                      AND entity_id = %s
                      AND action = 'CREATE'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (body["id"],),
                )

        assert blocked_override.status_code == 422
        assert response.status_code == 201
        assert body["task_id"] == str(task["id"])
        assert body["user_id"] == str(user["id"])
        assert body["author_name"] == "Comment Author"
        assert body["author_email"] == user["email"]
        assert body["comment"] == "This comment belongs to the authenticated user."
        assert body["created_at"] is not None
        assert stored["task_id"] == task["id"]
        assert stored["user_id"] == user["id"]
        assert stored["comment"] == "This comment belongs to the authenticated user."
        assert stored["created_at"] == stored["updated_at"]
        assert audit["user_id"] == user["id"]
        assert audit["new_values"]["comment"] == "This comment belongs to the authenticated user."
    finally:
        database.close()


def test_multiple_comments_can_be_listed_for_one_task_in_stable_order() -> None:
    database = _database_from_env()
    database.connect()
    try:
        first_user = _create_auth_user(database, "First Commenter", _unique_email("comments.first"))
        second_user = _create_auth_user(database, "Second Commenter", _unique_email("comments.second"))
        project = _create_project(database, first_user["id"], "Multiple Comment Project")
        phase = _create_phase(database, project["id"], first_user["id"], "Multiple Comment Phase", 1)
        task = _create_task(database, phase["id"], first_user["id"], "Multiple Comment Task")
        _add_project_member(database, project["id"], first_user["id"])
        _add_project_member(database, project["id"], second_user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            first_token = _login(client, first_user["email"])
            second_token = _login(client, second_user["email"])
            first = client.post(
                _comments_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(first_token),
                json={"comment": "First task comment."},
            )
            second = client.post(
                _comments_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(second_token),
                json={"comment": "Second task comment."},
            )
            listed = client.get(
                _comments_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(first_token),
            )

        assert first.status_code == 201
        assert second.status_code == 201
        assert listed.status_code == 200
        assert [row["id"] for row in listed.json()] == [first.json()["id"], second.json()["id"]]
        assert [row["comment"] for row in listed.json()] == [
            "First task comment.",
            "Second task comment.",
        ]
        assert [row["user_id"] for row in listed.json()] == [
            str(first_user["id"]),
            str(second_user["id"]),
        ]
    finally:
        database.close()


def test_comment_access_and_invalid_task_are_rejected() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Comment Access User", _unique_email("comments.access"))
        outsider = _create_auth_user(database, "Comment Outsider", _unique_email("comments.outsider"))
        project = _create_project(database, user["id"], "Comment Access Project")
        phase = _create_phase(database, project["id"], user["id"], "Comment Access Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Comment Access Task")
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            user_token = _login(client, user["email"])
            outsider_token = _login(client, outsider["email"])
            outsider_response = client.get(
                _comments_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(outsider_token),
            )
            unauthenticated = client.post(
                _comments_url(project["id"], phase["id"], task["id"]),
                json={"comment": "Unauthenticated comment."},
            )
            invalid_task = client.post(
                _comments_url(project["id"], phase["id"], uuid4()),
                headers=_auth_header(user_token),
                json={"comment": "Invalid task comment."},
            )

        assert outsider_response.status_code == 403
        assert unauthenticated.status_code == 401
        assert invalid_task.status_code == 404
    finally:
        database.close()


def test_empty_comment_is_rejected_by_request_validation() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Comment Validation", _unique_email("comments.validation"))
        project = _create_project(database, user["id"], "Comment Validation Project")
        phase = _create_phase(database, project["id"], user["id"], "Comment Validation Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Comment Validation Task")
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.post(
                _comments_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(token),
                json={"comment": ""},
            )

        assert response.status_code == 422
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "comment-password") -> dict:
    with database.session() as session:
        user = session.fetch_one(
            """
            INSERT INTO users (name, email)
            VALUES (%s, %s)
            RETURNING id, name, email
            """,
            (name, email),
        )
        session.execute(
            "INSERT INTO user_credentials (user_id, password_hash) VALUES (%s, %s)",
            (user["id"], hash_password(password)),
        )
        return user


def _create_project(database: Database, lead_id, name: str) -> dict:
    today = _database_today(database)
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO projects (
              code,
              name,
              description,
              project_lead_id,
              start_date,
              end_date,
              status
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'Planning')
            RETURNING *
            """,
            (
                "PRJ-2026-001",
                name,
                f"{name} description",
                lead_id,
                today,
                today + timedelta(days=30),
            ),
        )


def _create_phase(database: Database, project_id, owner_id, name: str, display_order: int) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (project_id, name, owner_id, display_order)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (project_id, name, owner_id, display_order),
        )


def _create_task(database: Database, phase_id, owner_id, name: str) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO tasks (phase_id, name, owner_id)
            VALUES (%s, %s, %s)
            RETURNING *
            """,
            (phase_id, name, owner_id),
        )


def _add_project_member(database: Database, project_id, user_id) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id) VALUES (%s, %s)",
            (project_id, user_id),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _comments_url(project_id, phase_id, task_id) -> str:
    return f"/projects/{project_id}/phases/{phase_id}/tasks/{task_id}/comments"


def _login(client: TestClient, email: str, password: str = "comment-password") -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid4().hex}@example.com"


def _database_from_env() -> Database:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for comment API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Comment API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-comment-secret",
        access_token_expire_minutes=60,
    )
