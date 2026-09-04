import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_authorized_user_can_retrieve_project_dashboard() -> None:
    database = _database_from_env()
    database.connect()
    try:
        lead = _create_auth_user(database, "Dashboard Lead", _unique_email("dashboard.lead"))
        today = _database_today(database)
        project = _create_project(
            database,
            lead["id"],
            "Dashboard Project",
            project_status="Active",
            start_date=today - timedelta(days=3),
            end_date=today + timedelta(days=7),
        )
        current_phase = _create_phase(
            database,
            project["id"],
            lead["id"],
            "Current Dashboard Phase",
            display_order=1,
            phase_status="In Progress",
            end_date=today + timedelta(days=3),
        )
        second_active_phase = _create_phase(
            database,
            project["id"],
            lead["id"],
            "Second Active Phase",
            display_order=2,
            phase_status="In Progress",
            end_date=today + timedelta(days=14),
        )
        _set_current_phase(database, project["id"], current_phase["id"])
        completed_task = _create_task(
            database,
            current_phase["id"],
            lead["id"],
            "Completed Dashboard Task",
            task_status="Completed",
            due_date=today + timedelta(days=1),
        )
        checklist_task = _create_task(
            database,
            second_active_phase["id"],
            lead["id"],
            "Checklist Dashboard Task",
            task_status="In Progress",
            due_date=today + timedelta(days=5),
        )
        _create_deliverable(database, checklist_task["id"], "Finished checklist item", 1, True)
        _create_deliverable(database, checklist_task["id"], "Open checklist item", 2, False)
        _add_project_member(database, project["id"], lead["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, lead["email"])
            response = client.get(f"/projects/{project['id']}/dashboard", headers=_auth_header(token))

        assert response.status_code == 200
        body = response.json()
        assert body["project"]["id"] == str(project["id"])
        assert body["project"]["project_lead"]["id"] == str(lead["id"])
        assert body["project"]["status"] == "Active"
        assert body["project"]["health"] == "At Risk"
        assert float(body["project"]["overall_progress"]) == pytest.approx(75.0)
        assert body["current_phase"]["id"] == str(current_phase["id"])
        assert body["current_phase"]["project_id"] == str(project["id"])
        assert {phase["status"] for phase in body["phases"]} == {"In Progress"}
        assert len(body["phases"]) == 2
        assert {item["entity_type"] for item in body["upcoming_deadlines"]} == {"project", "phase", "task"}
        assert {item["phase_id"] for item in body["deliverables"]} == {str(second_active_phase["id"])}
        assert {item["description"] for item in body["deliverables"]} == {
            "Finished checklist item",
            "Open checklist item",
        }
    finally:
        database.close()


def test_inaccessible_project_dashboard_is_rejected() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Dashboard User", _unique_email("dashboard.user"))
        lead = _create_auth_user(database, "Hidden Lead", _unique_email("dashboard.hiddenlead"))
        project = _create_project(database, lead["id"], "Hidden Dashboard Project")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get(f"/projects/{project['id']}/dashboard", headers=_auth_header(token))

        assert response.status_code == 403
        assert response.json() == {"error": {"message": "Project access denied"}}
    finally:
        database.close()


def test_dashboard_progress_is_zero_for_project_with_zero_phases() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Zero Phase User", _unique_email("dashboard.zerophase"))
        project = _create_project(database, user["id"], "Zero Phase Project")
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get(f"/projects/{project['id']}/dashboard", headers=_auth_header(token))

        assert response.status_code == 200
        body = response.json()
        assert float(body["project"]["overall_progress"]) == pytest.approx(0.0)
        assert body["current_phase"] is None
        assert body["phases"] == []
        assert body["deliverables"] == []
    finally:
        database.close()


def test_dashboard_progress_handles_zero_task_phases_and_task_deliverables() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Progress User", _unique_email("dashboard.progress"))
        project = _create_project(database, user["id"], "Dashboard Progress Project")
        empty_phase = _create_phase(database, project["id"], user["id"], "Empty Phase", 1)
        task_phase = _create_phase(database, project["id"], user["id"], "Task Phase", 2)
        completed_task = _create_task(
            database,
            task_phase["id"],
            user["id"],
            "Completed Progress Task",
            task_status="Completed",
        )
        blocked_task = _create_task(
            database,
            task_phase["id"],
            user["id"],
            "Blocked Progress Task",
            task_status="Blocked",
        )
        checklist_task = _create_task(
            database,
            task_phase["id"],
            user["id"],
            "Checklist Progress Task",
            task_status="Not Started",
        )
        _create_deliverable(database, checklist_task["id"], "Done", 1, True)
        _create_deliverable(database, checklist_task["id"], "Still open", 2, False)
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get(f"/projects/{project['id']}/dashboard", headers=_auth_header(token))

        assert response.status_code == 200
        body = response.json()
        phases = {phase["id"]: phase for phase in body["phases"]}
        assert float(phases[str(empty_phase["id"])]["progress"]) == pytest.approx(0.0)
        assert float(phases[str(task_phase["id"])]["progress"]) == pytest.approx(50.0)
        assert float(body["project"]["overall_progress"]) == pytest.approx(50.0)
        assert len(body["deliverables"]) == 2
        assert {item["task_id"] for item in body["deliverables"]} == {str(checklist_task["id"])}
        assert completed_task["id"] != blocked_task["id"]
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "dashboard-password") -> dict:
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


def _create_phase(
    database: Database,
    project_id,
    owner_id,
    name: str,
    display_order: int,
    phase_status: str = "Not Started",
    end_date=None,
) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (
              project_id,
              name,
              owner_id,
              display_order,
              status,
              end_date
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (project_id, name, owner_id, display_order, phase_status, end_date),
        )


def _create_task(
    database: Database,
    phase_id,
    owner_id,
    name: str,
    task_status: str = "Not Started",
    due_date=None,
) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO tasks (phase_id, name, owner_id, status, due_date)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (phase_id, name, owner_id, task_status, due_date),
        )


def _create_deliverable(database: Database, task_id, description: str, display_order: int, is_completed: bool) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO task_deliverables (task_id, description, display_order, is_completed)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (task_id, description, display_order, is_completed),
        )


def _set_current_phase(database: Database, project_id, phase_id) -> None:
    with database.session() as session:
        session.execute(
            "UPDATE projects SET current_phase_id = %s WHERE id = %s",
            (phase_id, project_id),
        )


def _add_project_member(database: Database, project_id, user_id) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, 'PM')",
            (project_id, user_id),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _login(client: TestClient, email: str, password: str = "dashboard-password") -> str:
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
        pytest.skip("DATABASE_URL is required for project dashboard integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Project Dashboard Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-project-dashboard-secret",
        access_token_expire_minutes=60,
    )
