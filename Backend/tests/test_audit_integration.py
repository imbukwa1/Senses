import os
from datetime import date
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
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with database.session(actor_user_id=user["id"]) as session:
            project = _create_project_direct(session, user["id"], "Audit Integration Project")
            project_id = str(project["id"])
            session.execute(
                "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, 'PM')",
                (project["id"], user["id"]),
            )

        with TestClient(app) as client:
            token = _login(client, user["email"])
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
            project = _create_project_direct(session, user["id"], "System Audit Project")
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
            project = _create_project_direct(session, user["id"], "Append Only Audit Project")
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


def test_membership_and_budget_changes_are_audited() -> None:
    database = _database_from_env()
    database.connect()
    try:
        actor = _create_auth_user(database, "Audit Membership Actor", _unique_email("audit.memberactor"))
        member = _create_auth_user(database, "Audit Membership Member", _unique_email("audit.member"))

        with database.session(actor_user_id=actor["id"]) as session:
            project = _create_project_direct(session, actor["id"], "Audit Membership Project")
            phase = session.fetch_one(
                """
                INSERT INTO phases (project_id, name, owner_id, display_order, status)
                VALUES (%s, 'Audit Membership Phase', %s, 1, 'In Progress')
                RETURNING id
                """,
                (project["id"], actor["id"]),
            )
            task = session.fetch_one(
                """
                INSERT INTO tasks (phase_id, name, owner_id, status)
                VALUES (%s, 'Audit Membership Task', %s, 'Not Started')
                RETURNING id
                """,
                (phase["id"], actor["id"]),
            )
            session.execute(
                "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, 'PM')",
                (project["id"], actor["id"]),
            )
            session.execute(
                "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, 'Team Member')",
                (project["id"], member["id"]),
            )
            session.execute(
                "UPDATE project_members SET role = 'Finance' WHERE project_id = %s AND user_id = %s",
                (project["id"], member["id"]),
            )
            session.execute(
                "INSERT INTO phase_members (phase_id, user_id) VALUES (%s, %s)",
                (phase["id"], member["id"]),
            )
            session.execute(
                "INSERT INTO task_supporters (task_id, user_id) VALUES (%s, %s)",
                (task["id"], member["id"]),
            )
            session.execute(
                "UPDATE projects SET budget_allocated = 1000, budget_spent = 250 WHERE id = %s",
                (project["id"],),
            )

            audit_rows = session.fetch_all(
                """
                SELECT user_id, entity_type, action, old_values, new_values, created_at
                FROM audit_logs
                WHERE user_id = %s
                  AND entity_type IN ('project_members', 'phase_members', 'task_supporters', 'projects')
                ORDER BY created_at, entity_type, action
                """,
                (actor["id"],),
            )

        project_member_create = _find_audit(audit_rows, "project_members", "CREATE", "user_id", str(member["id"]))
        project_member_update = _find_audit(audit_rows, "project_members", "UPDATE", "user_id", str(member["id"]))
        phase_member_create = _find_audit(audit_rows, "phase_members", "CREATE", "user_id", str(member["id"]))
        supporter_create = _find_audit(audit_rows, "task_supporters", "CREATE", "user_id", str(member["id"]))
        budget_update = next(
            row
            for row in audit_rows
            if row["entity_type"] == "projects"
            and row["action"] == "UPDATE"
            and row["new_values"]["budget_allocated"] == 1000
            and row["new_values"]["budget_spent"] == 250
        )

        assert project_member_create["new_values"]["role"] == "Team Member"
        assert project_member_update["old_values"]["role"] == "Team Member"
        assert project_member_update["new_values"]["role"] == "Finance"
        assert phase_member_create["new_values"]["phase_id"] == str(phase["id"])
        assert supporter_create["new_values"]["task_id"] == str(task["id"])
        assert budget_update["old_values"]["budget_allocated"] == 0
        assert budget_update["old_values"]["budget_spent"] == 0
        assert all(row["created_at"] is not None for row in audit_rows)
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


def _create_project_direct(session, lead_id, name: str) -> dict:
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
          created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, 'Planning', %s)
        RETURNING id
        """,
        (
            "PRJ-2097-001",
            name,
            f"{name} description",
            lead_id,
            date(2097, 1, 1),
            date(2097, 12, 31),
            date(2097, 1, 1),
        ),
    )


def _find_audit(rows: list[dict], entity_type: str, action: str, key: str, value: str) -> dict:
    return next(
        row
        for row in rows
        if row["entity_type"] == entity_type
        and row["action"] == action
        and row["new_values"] is not None
        and row["new_values"][key] == value
    )


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
