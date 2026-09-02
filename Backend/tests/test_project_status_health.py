import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


ALLOWED_STATUSES = ["Planning", "Not Started", "Active", "On Hold", "Completed"]


def test_each_allowed_project_status_is_accepted_and_audited() -> None:
    database = _database_from_env()
    database.connect()
    try:
        lead = _create_auth_user(database, "Status Lead", _unique_email("status.lead"))
        project = _create_project(database, lead["id"], "Status API Project")
        _add_project_member(database, project["id"], lead["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, lead["email"])
            for project_status in ALLOWED_STATUSES:
                response = client.patch(
                    f"/projects/{project['id']}/status",
                    headers=_auth_header(token),
                    json={"status": project_status},
                )
                assert response.status_code == 200
                assert response.json()["status"] == project_status

            with database.session() as session:
                audit = session.fetch_one(
                    """
                    SELECT user_id, old_values, new_values
                    FROM audit_logs
                    WHERE entity_type = 'projects'
                      AND entity_id = %s
                      AND action = 'UPDATE'
                      AND new_values->>'status' = 'Completed'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (project["id"],),
                )

        assert audit["user_id"] == lead["id"]
        assert audit["new_values"]["status"] == "Completed"
    finally:
        database.close()


def test_invalid_status_and_manual_health_are_rejected() -> None:
    database = _database_from_env()
    database.connect()
    try:
        lead = _create_auth_user(database, "Invalid Status Lead", _unique_email("status.invalid"))
        project = _create_project(database, lead["id"], "Invalid Status Project")
        _add_project_member(database, project["id"], lead["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, lead["email"])
            invalid_status = client.patch(
                f"/projects/{project['id']}/status",
                headers=_auth_header(token),
                json={"status": "Paused"},
            )
            manual_health_on_project = client.patch(
                f"/projects/{project['id']}",
                headers=_auth_header(token),
                json={"health": "Delayed"},
            )
            manual_health_on_status = client.patch(
                f"/projects/{project['id']}/status",
                headers=_auth_header(token),
                json={"status": "Active", "health": "Delayed"},
            )

        assert invalid_status.status_code == 422
        assert manual_health_on_project.status_code == 422
        assert manual_health_on_status.status_code == 422
    finally:
        database.close()


def test_project_health_is_returned_from_locked_database_logic() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Health User", _unique_email("health.user"))
        today = _database_today(database)
        completed_overdue = _create_project(
            database,
            user["id"],
            "Completed Overdue Project",
            project_status="Completed",
            start_date=today - timedelta(days=20),
            end_date=today - timedelta(days=10),
        )
        delayed = _create_project(
            database,
            user["id"],
            "Delayed Project",
            project_status="Active",
            start_date=today - timedelta(days=20),
            end_date=today - timedelta(days=1),
        )
        at_risk = _create_project(
            database,
            user["id"],
            "At Risk Project",
            project_status="Active",
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=7),
        )
        active = _create_project(
            database,
            user["id"],
            "Active Health Project",
            project_status="Planning",
            start_date=today,
            end_date=today + timedelta(days=30),
        )
        for project in (completed_overdue, delayed, at_risk, active):
            _add_project_member(database, project["id"], user["id"])

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            completed_response = client.get(f"/projects/{completed_overdue['id']}", headers=_auth_header(token))
            delayed_response = client.get(f"/projects/{delayed['id']}", headers=_auth_header(token))
            at_risk_response = client.get(f"/projects/{at_risk['id']}", headers=_auth_header(token))
            active_response = client.get(f"/projects/{active['id']}", headers=_auth_header(token))

        assert completed_response.json()["health"] == "Completed"
        assert delayed_response.json()["health"] == "Delayed"
        assert at_risk_response.json()["health"] == "At Risk"
        assert active_response.json()["health"] == "Active"
    finally:
        database.close()


def test_only_accessible_project_lead_can_change_status() -> None:
    database = _database_from_env()
    database.connect()
    try:
        lead = _create_auth_user(database, "Authorized Lead", _unique_email("status.authorized"))
        member = _create_auth_user(database, "Status Member", _unique_email("status.member"))
        nonmember_lead = _create_auth_user(database, "Nonmember Lead", _unique_email("status.nonmember"))
        project = _create_project(database, lead["id"], "Lead Status Project")
        lead_only_project = _create_project(database, nonmember_lead["id"], "Nonmember Lead Project")
        _add_project_member(database, project["id"], lead["id"])
        _add_project_member(database, project["id"], member["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            member_token = _login(client, member["email"])
            lead_token = _login(client, lead["email"])
            nonmember_lead_token = _login(client, nonmember_lead["email"])
            member_status_response = client.patch(
                f"/projects/{project['id']}/status",
                headers=_auth_header(member_token),
                json={"status": "On Hold"},
            )
            member_generic_status_response = client.patch(
                f"/projects/{project['id']}",
                headers=_auth_header(member_token),
                json={"status": "On Hold"},
            )
            lead_status_response = client.patch(
                f"/projects/{project['id']}/status",
                headers=_auth_header(lead_token),
                json={"status": "On Hold"},
            )
            nonmember_lead_response = client.patch(
                f"/projects/{lead_only_project['id']}/status",
                headers=_auth_header(nonmember_lead_token),
                json={"status": "Active"},
            )

        assert member_status_response.status_code == 403
        assert member_generic_status_response.status_code == 403
        assert lead_status_response.status_code == 200
        assert lead_status_response.json()["status"] == "On Hold"
        assert nonmember_lead_response.status_code == 403
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "health-password") -> dict:
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


def _create_project(
    database: Database,
    lead_id,
    name: str,
    project_status: str = "Planning",
    start_date=None,
    end_date=None,
) -> dict:
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
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                "PRJ-2026-001",
                name,
                f"{name} description",
                lead_id,
                start_date or today,
                end_date or today + timedelta(days=30),
                project_status,
            ),
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


def _login(client: TestClient, email: str, password: str = "health-password") -> str:
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
        pytest.skip("DATABASE_URL is required for project status/health integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Project Status Health Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-project-health-secret",
        access_token_expire_minutes=60,
    )
