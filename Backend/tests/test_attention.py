import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_attention_includes_overdue_and_blocked_tasks_with_context() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Attention User", _unique_email("attention.user"))
        project = _create_project(database, user["id"], "Attention Task Project")
        phase = _create_phase(database, project["id"], user["id"], "Attention Task Phase", 1)
        today = _database_today(database)
        overdue = _create_task(database, phase["id"], user["id"], "Overdue Attention Task", due_date=today - timedelta(days=1))
        blocked = _create_task(database, phase["id"], user["id"], "Blocked Attention Task", task_status="Blocked")
        _create_task(
            database,
            phase["id"],
            user["id"],
            "Completed Old Attention Task",
            due_date=today - timedelta(days=2),
            task_status="Completed",
        )
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/attention", headers=_auth_header(token))

        assert response.status_code == 200
        items = response.json()
        task_items = {item["task_name"]: item for item in items if item["type"] == "task"}
        assert set(task_items) == {"Overdue Attention Task", "Blocked Attention Task"}
        assert task_items["Overdue Attention Task"]["task_id"] == str(overdue["id"])
        assert task_items["Overdue Attention Task"]["phase_id"] == str(phase["id"])
        assert task_items["Overdue Attention Task"]["project_id"] == str(project["id"])
        assert task_items["Overdue Attention Task"]["reason"] == "Overdue Attention Task is overdue"
        assert task_items["Blocked Attention Task"]["task_id"] == str(blocked["id"])
        assert task_items["Blocked Attention Task"]["reason"] == "Blocked Attention Task is blocked"
        assert {item["severity"] for item in task_items.values()} == {"Needs attention"}
    finally:
        database.close()


def test_attention_includes_delayed_and_at_risk_projects_and_delayed_phases() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Schedule User", _unique_email("attention.schedule"))
        today = _database_today(database)
        delayed_project = _create_project(
            database,
            user["id"],
            "Delayed Attention Project",
            end_date=today - timedelta(days=1),
        )
        at_risk_project = _create_project(
            database,
            user["id"],
            "Risk Attention Project",
            end_date=today + timedelta(days=7),
        )
        delayed_phase = _create_phase(
            database,
            at_risk_project["id"],
            user["id"],
            "Delayed Attention Phase",
            1,
            end_date=today - timedelta(days=1),
        )
        _create_phase(
            database,
            at_risk_project["id"],
            user["id"],
            "Completed Delayed Phase",
            2,
            phase_status="Completed",
            end_date=today - timedelta(days=3),
        )
        _add_project_member(database, delayed_project["id"], user["id"], "PM")
        _add_project_member(database, at_risk_project["id"], user["id"], "PM")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/attention", headers=_auth_header(token))

        assert response.status_code == 200
        items = response.json()
        projects = {item["project_name"]: item for item in items if item["type"] == "project"}
        phases = {item["phase_name"]: item for item in items if item["type"] == "phase"}
        assert projects["Delayed Attention Project"]["reason"] == "Project deadline has passed"
        assert projects["Delayed Attention Project"]["severity"] == "At risk"
        assert projects["Risk Attention Project"]["reason"] == "Risk Attention Project needs attention"
        assert projects["Risk Attention Project"]["severity"] == "Needs attention"
        assert phases["Delayed Attention Phase"]["phase_id"] == str(delayed_phase["id"])
        assert phases["Delayed Attention Phase"]["reason"] == "Delayed Attention Phase is behind schedule"
        assert phases["Delayed Attention Phase"]["severity"] == "At risk"
        assert "Completed Delayed Phase" not in phases
    finally:
        database.close()


def test_attention_scopes_pm_team_member_and_finance_visibility() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Attention PM", _unique_email("attention.pm"))
        team_member = _create_auth_user(database, "Attention Team", _unique_email("attention.team"))
        finance = _create_auth_user(database, "Attention Finance", _unique_email("attention.finance"))
        other = _create_auth_user(database, "Attention Other", _unique_email("attention.other"))
        today = _database_today(database)
        project = _create_project(database, pm["id"], "Role Attention Project", end_date=today - timedelta(days=1))
        phase = _create_phase(database, project["id"], pm["id"], "Role Attention Phase", 1, end_date=today - timedelta(days=1))
        pm_visible_task = _create_task(database, phase["id"], other["id"], "PM Visible Task", due_date=today - timedelta(days=1))
        team_task = _create_task(database, phase["id"], team_member["id"], "Team Visible Task", due_date=today - timedelta(days=1))
        finance_task = _create_task(database, phase["id"], other["id"], "Finance Supported Task", task_status="Blocked")
        hidden_project = _create_project(database, other["id"], "Hidden Attention Project", end_date=today - timedelta(days=1))
        hidden_phase = _create_phase(database, hidden_project["id"], other["id"], "Hidden Attention Phase", 1)
        _create_task(database, hidden_phase["id"], other["id"], "Hidden Attention Task", due_date=today - timedelta(days=1))
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team_member["id"], "Team Member")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        _add_project_member(database, project["id"], other["id"], "Team Member")
        _add_project_member(database, hidden_project["id"], other["id"], "PM")
        _add_phase_member(database, phase["id"], team_member["id"])
        _add_task_supporter(database, finance_task["id"], finance["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            team_token = _login(client, team_member["email"])
            finance_token = _login(client, finance["email"])
            pm_response = client.get("/attention", headers=_auth_header(pm_token))
            team_response = client.get("/attention", headers=_auth_header(team_token))
            finance_response = client.get("/attention", headers=_auth_header(finance_token))

        assert pm_response.status_code == 200
        assert team_response.status_code == 200
        assert finance_response.status_code == 200

        pm_tasks = {item["task_id"] for item in pm_response.json() if item["type"] == "task"}
        team_items = team_response.json()
        finance_items = finance_response.json()

        assert str(pm_visible_task["id"]) in pm_tasks
        assert str(team_task["id"]) in pm_tasks
        assert {item["task_name"] for item in team_items if item["type"] == "task"} == {"Team Visible Task"}
        assert {item["phase_name"] for item in team_items if item["type"] == "phase"} == {"Role Attention Phase"}
        assert {item["task_name"] for item in finance_items if item["type"] == "task"} == {"Finance Supported Task"}
        assert {item["type"] for item in finance_items if item["type"] == "project"} == {"project"}
        assert all(item["project_name"] != "Hidden Attention Project" for item in pm_response.json())
        assert all(item["project_name"] != "Hidden Attention Project" for item in team_items)
        assert all(item["project_name"] != "Hidden Attention Project" for item in finance_items)
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "attention-password") -> dict:
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
    project_status: str = "Active",
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
                "PRJ-0000-000",
                name,
                f"{name} description",
                lead_id,
                start_date or today - timedelta(days=7),
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
    phase_status: str = "In Progress",
    end_date=None,
) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (project_id, name, owner_id, display_order, status, end_date)
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
    due_date=None,
    task_status: str = "Not Started",
) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO tasks (phase_id, name, owner_id, due_date, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (phase_id, name, owner_id, due_date, task_status),
        )


def _add_project_member(database: Database, project_id, user_id, role: str = "Team Member") -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _add_phase_member(database: Database, phase_id, user_id) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO phase_members (phase_id, user_id) VALUES (%s, %s)",
            (phase_id, user_id),
        )


def _add_task_supporter(database: Database, task_id, user_id) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO task_supporters (task_id, user_id) VALUES (%s, %s)",
            (task_id, user_id),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _login(client: TestClient, email: str, password: str = "attention-password") -> str:
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
        pytest.skip("DATABASE_URL is required for Attention API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Attention API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-attention-secret",
        access_token_expire_minutes=60,
    )
