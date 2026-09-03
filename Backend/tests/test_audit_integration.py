import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database, DatabaseError
from app.main import create_app


def test_authenticated_create_and_update_requests_write_audit_rows() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Audit API User", _unique_email("audit.api"))
        today = _database_today(database)
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            created = client.post(
                "/projects",
                headers=_auth_header(token),
                json={
                    "name": "Audit Integration Project",
                    "description": "Created through authenticated API for audit validation.",
                    "project_lead_id": str(user["id"]),
                    "start_date": str(today),
                    "end_date": str(today + timedelta(days=30)),
                    "status": "Planning",
                },
            )
            project_id = created.json()["id"]
            updated = client.patch(
                f"/projects/{project_id}",
                headers=_auth_header(token),
                json={"name": "Audit Integration Project Updated"},
            )

            with database.session() as session:
                create_audit = session.fetch_one(
                    """
                    SELECT user_id, entity_type, entity_id, action, old_values, new_values, created_at
                    FROM audit_logs
                    WHERE entity_type = 'projects'
                      AND entity_id = %s
                      AND action = 'CREATE'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (project_id,),
                )
                update_audit = session.fetch_one(
                    """
                    SELECT user_id, entity_type, entity_id, action, old_values, new_values, created_at
                    FROM audit_logs
                    WHERE entity_type = 'projects'
                      AND entity_id = %s
                      AND action = 'UPDATE'
                      AND old_values->>'name' = 'Audit Integration Project'
                      AND new_values->>'name' = 'Audit Integration Project Updated'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (project_id,),
                )

        assert created.status_code == 201
        assert updated.status_code == 200
        assert create_audit["user_id"] == user["id"]
        assert create_audit["entity_type"] == "projects"
        assert str(create_audit["entity_id"]) == project_id
        assert create_audit["action"] == "CREATE"
        assert create_audit["old_values"] is None
        assert create_audit["new_values"]["name"] == "Audit Integration Project"
        assert create_audit["created_at"] is not None
        assert update_audit["user_id"] == user["id"]
        assert update_audit["entity_type"] == "projects"
        assert str(update_audit["entity_id"]) == project_id
        assert update_audit["action"] == "UPDATE"
        assert update_audit["old_values"]["name"] == "Audit Integration Project"
        assert update_audit["new_values"]["name"] == "Audit Integration Project Updated"
        assert update_audit["created_at"] is not None
    finally:
        database.close()


def test_system_generated_changes_can_use_null_audit_actor() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Audit System User", _unique_email("audit.system"))
        with database.session() as session:
            project = session.fetch_one(
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
                VALUES (%s, 'System Audit Project', 'System actor validation.', %s, CURRENT_DATE, CURRENT_DATE + 30, 'Planning')
                RETURNING id
                """,
                ("PRJ-2026-001", user["id"]),
            )
            audit = session.fetch_one(
                """
                SELECT user_id, action, old_values, new_values, created_at
                FROM audit_logs
                WHERE entity_type = 'projects'
                  AND entity_id = %s
                  AND action = 'CREATE'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (project["id"],),
            )

        assert audit["user_id"] is None
        assert audit["action"] == "CREATE"
        assert audit["old_values"] is None
        assert audit["new_values"]["name"] == "System Audit Project"
        assert audit["created_at"] is not None
    finally:
        database.close()


def test_audit_logs_are_append_only_for_application_database_access() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Audit Protected User", _unique_email("audit.protected"))
        with database.session(actor_user_id=user["id"]) as session:
            project = session.fetch_one(
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
                VALUES (%s, 'Append Only Audit Project', 'Append-only validation.', %s, CURRENT_DATE, CURRENT_DATE + 30, 'Planning')
                RETURNING id
                """,
                ("PRJ-2026-001", user["id"]),
            )
            audit = session.fetch_one(
                """
                SELECT id
                FROM audit_logs
                WHERE entity_type = 'projects'
                  AND entity_id = %s
                  AND action = 'CREATE'
                LIMIT 1
                """,
                (project["id"],),
            )

        with pytest.raises(DatabaseError):
            with database.session(actor_user_id=user["id"]) as session:
                session.execute("UPDATE audit_logs SET action = action WHERE id = %s", (audit["id"],))

        with pytest.raises(DatabaseError):
            with database.session(actor_user_id=user["id"]) as session:
                session.execute("DELETE FROM audit_logs WHERE id = %s", (audit["id"],))
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "audit-password") -> dict:
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


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _login(client: TestClient, email: str, password: str = "audit-password") -> str:
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
        pytest.skip("DATABASE_URL is required for audit integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Audit Integration Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-audit-secret",
        access_token_expire_minutes=60,
    )
