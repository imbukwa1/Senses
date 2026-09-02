import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_project_search_returns_accessible_project_result() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Search Project User", _unique_email("search.project"))
        token_text = f"project-search-{uuid4().hex}"
        project = _create_project(database, user["id"], "River Atlas", objectives=token_text)
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/search", params={"q": token_text}, headers=_auth_header(token))

        assert response.status_code == 200
        assert response.json() == [
            {
                "result_type": "project",
                "project_id": str(project["id"]),
                "project_code": project["code"],
                "project_name": "River Atlas",
                "phase_id": None,
                "phase_name": None,
                "task_id": None,
                "task_name": None,
                "status": "Planning",
                "created_at": project["created_at"].isoformat().replace("+00:00", "Z"),
                "updated_at": project["updated_at"].isoformat().replace("+00:00", "Z"),
            }
        ]
    finally:
        database.close()


def test_phase_search_includes_project_context() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Search Phase User", _unique_email("search.phase"))
        token_text = f"phase-search-{uuid4().hex}"
        project = _create_project(database, user["id"], "Phase Context Project")
        phase = _create_phase(database, project["id"], user["id"], "Baseline Survey", 1, objectives=token_text)
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/search", params={"q": token_text}, headers=_auth_header(token))
            body = response.json()

        assert response.status_code == 200
        assert len(body) == 1
        assert body[0]["result_type"] == "phase"
        assert body[0]["project_id"] == str(project["id"])
        assert body[0]["project_code"] == project["code"]
        assert body[0]["project_name"] == "Phase Context Project"
        assert body[0]["phase_id"] == str(phase["id"])
        assert body[0]["phase_name"] == "Baseline Survey"
        assert body[0]["task_id"] is None
        assert body[0]["task_name"] is None
        assert body[0]["status"] == "Not Started"
    finally:
        database.close()


def test_task_search_includes_phase_and_project_context() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Search Task User", _unique_email("search.task"))
        token_text = f"task-search-{uuid4().hex}"
        project = _create_project(database, user["id"], "Task Context Project")
        phase = _create_phase(database, project["id"], user["id"], "Task Context Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Validate Sensor Packet", description=token_text)
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/search", params={"q": token_text}, headers=_auth_header(token))
            body = response.json()

        assert response.status_code == 200
        assert len(body) == 1
        assert body[0]["result_type"] == "task"
        assert body[0]["project_id"] == str(project["id"])
        assert body[0]["project_name"] == "Task Context Project"
        assert body[0]["phase_id"] == str(phase["id"])
        assert body[0]["phase_name"] == "Task Context Phase"
        assert body[0]["task_id"] == str(task["id"])
        assert body[0]["task_name"] == "Validate Sensor Packet"
        assert body[0]["status"] == "Not Started"
    finally:
        database.close()


def test_no_match_query_returns_empty_list() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Search Empty User", _unique_email("search.empty"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get(
                "/search",
                params={"q": f"definitely-no-search-match-{uuid4().hex}"},
                headers=_auth_header(token),
            )

        assert response.status_code == 200
        assert response.json() == []
    finally:
        database.close()


def test_search_respects_project_access_and_requires_authentication() -> None:
    database = _database_from_env()
    database.connect()
    try:
        member = _create_auth_user(database, "Search Member", _unique_email("search.member"))
        outsider = _create_auth_user(database, "Search Outsider", _unique_email("search.outsider"))
        token_text = f"inaccessible-search-{uuid4().hex}"
        project = _create_project(database, member["id"], "Access Filter Project", objectives=token_text)
        phase = _create_phase(database, project["id"], member["id"], "Access Filter Phase", 1, objectives=token_text)
        _create_task(database, phase["id"], member["id"], "Access Filter Task", description=token_text)
        _add_project_member(database, project["id"], member["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            member_token = _login(client, member["email"])
            outsider_token = _login(client, outsider["email"])
            member_response = client.get("/search", params={"q": token_text}, headers=_auth_header(member_token))
            outsider_response = client.get("/search", params={"q": token_text}, headers=_auth_header(outsider_token))
            unauthenticated = client.get("/search", params={"q": token_text})

        assert member_response.status_code == 200
        assert {row["result_type"] for row in member_response.json()} == {"project", "phase", "task"}
        assert outsider_response.status_code == 200
        assert outsider_response.json() == []
        assert unauthenticated.status_code == 401
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "search-password") -> dict:
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


def _create_project(database: Database, lead_id, name: str, objectives: str | None = None) -> dict:
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
              status,
              objectives
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'Planning', %s)
            RETURNING *
            """,
            (
                "PRJ-2026-001",
                name,
                f"{name} description",
                lead_id,
                today,
                today + timedelta(days=30),
                objectives,
            ),
        )


def _create_phase(
    database: Database,
    project_id,
    owner_id,
    name: str,
    display_order: int,
    objectives: str | None = None,
) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (project_id, name, owner_id, display_order, objectives)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (project_id, name, owner_id, display_order, objectives),
        )


def _create_task(
    database: Database,
    phase_id,
    owner_id,
    name: str,
    description: str | None = None,
) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO tasks (phase_id, name, description, owner_id)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (phase_id, name, description, owner_id),
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


def _login(client: TestClient, email: str, password: str = "search-password") -> str:
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
        pytest.skip("DATABASE_URL is required for search API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Search API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-search-secret",
        access_token_expire_minutes=60,
    )
