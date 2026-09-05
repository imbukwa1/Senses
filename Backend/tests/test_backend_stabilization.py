import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_invalid_uuid_paths_are_rejected_by_request_validation() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Invalid UUID User", _unique_email("stabilization.uuid"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/projects/not-a-uuid", headers=_auth_header(token))

        assert response.status_code == 422
        assert response.json() == {"error": {"message": "Invalid input"}}
    finally:
        database.close()


def test_missing_project_returns_not_found_without_exposing_data() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Missing Project User", _unique_email("stabilization.missing"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get(f"/projects/{uuid4()}", headers=_auth_header(token))

        assert response.status_code == 404
        assert response.json()["error"]["message"] == "Project not found"
    finally:
        database.close()


def test_duplicate_project_membership_does_not_create_duplicate_rows() -> None:
    database = _database_from_env()
    database.connect()
    try:
        actor = _create_auth_user(database, "Membership Actor", _unique_email("stabilization.actor"))
        member = _create_auth_user(database, "Membership Member", _unique_email("stabilization.member"))
        project = _create_project(database, actor["id"], "Duplicate Membership Project")
        _add_project_member(database, project["id"], actor["id"], role="PM")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, actor["email"])
            first = client.post(
                f"/projects/{project['id']}/members",
                headers=_auth_header(token),
                json={"user_id": str(member["id"])},
            )
            duplicate = client.post(
                f"/projects/{project['id']}/members",
                headers=_auth_header(token),
                json={"user_id": str(member["id"])},
            )
            listed = client.get(f"/projects/{project['id']}/members", headers=_auth_header(token))

        assert first.status_code == 201
        assert duplicate.status_code == 201
        assert [row["user_id"] for row in listed.json()].count(str(member["id"])) == 1
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "stabilization-password") -> dict:
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


def _add_project_member(database: Database, project_id, user_id, role: str = "Team Member") -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _login(client: TestClient, email: str, password: str = "stabilization-password") -> str:
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
        pytest.skip("DATABASE_URL is required for backend stabilization tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Backend Stabilization Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-stabilization-secret",
        access_token_expire_minutes=60,
    )
