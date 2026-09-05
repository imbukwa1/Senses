import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_my_work_returns_only_owned_and_supported_tasks_with_context() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "My Work User", _unique_email("mywork.user"))
        other = _create_auth_user(database, "My Work Other", _unique_email("mywork.other"))
        project = _create_project(database, user["id"], "My Work Project")
        phase = _create_phase(database, project["id"], user["id"], "My Work Phase", 1)
        owned = _create_task(database, phase["id"], user["id"], "Owned Task")
        supported = _create_task(database, phase["id"], other["id"], "Supported Task")
        unrelated = _create_task(database, phase["id"], other["id"], "Unrelated Task")
        _add_project_member(database, project["id"], user["id"])
        _add_project_member(database, project["id"], other["id"])
        _add_phase_member(database, phase["id"], user["id"])
        _add_task_supporter(database, supported["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/my-work", headers=_auth_header(token))

        assert response.status_code == 200
        items = response.json()
        assert [item["task_name"] for item in items] == ["Owned Task", "Supported Task"]
        assert {item["task_id"] for item in items} == {str(owned["id"]), str(supported["id"])}
        assert str(unrelated["id"]) not in {item["task_id"] for item in items}
        assert items[0]["project_id"] == str(project["id"])
        assert items[0]["project_name"] == "My Work Project"
        assert items[0]["project_code"] == project["code"]
        assert items[0]["phase_id"] == str(phase["id"])
        assert items[0]["phase_name"] == "My Work Phase"
        assert {item["relationship"] for item in items} == {"owner", "supporter"}
    finally:
        database.close()


def test_phase_membership_alone_does_not_add_task_to_my_work() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Phase Only User", _unique_email("mywork.phaseonly"))
        other = _create_auth_user(database, "Phase Only Other", _unique_email("mywork.phaseother"))
        project = _create_project(database, other["id"], "Phase Only Project")
        phase = _create_phase(database, project["id"], other["id"], "Phase Only Phase", 1)
        _create_task(database, phase["id"], other["id"], "Not Assigned Through Phase")
        _add_project_member(database, project["id"], user["id"])
        _add_project_member(database, project["id"], other["id"])
        _add_phase_member(database, phase["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/my-work", headers=_auth_header(token))

        assert response.status_code == 200
        assert response.json() == []
    finally:
        database.close()


def test_my_work_overdue_logic_and_sorting() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Due User", _unique_email("mywork.due"))
        project = _create_project(database, user["id"], "Due Project")
        phase = _create_phase(database, project["id"], user["id"], "Due Phase", 1)
        today = _database_today(database)
        overdue = _create_task(database, phase["id"], user["id"], "Overdue Task", due_date=today - timedelta(days=1))
        completed_old = _create_task(
            database,
            phase["id"],
            user["id"],
            "Completed Old Task",
            due_date=today - timedelta(days=2),
            task_status="Completed",
        )
        due_today = _create_task(database, phase["id"], user["id"], "Due Today Task", due_date=today)
        later = _create_task(database, phase["id"], user["id"], "Later Task", due_date=today + timedelta(days=7))
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get("/my-work", headers=_auth_header(token))

        assert response.status_code == 200
        items = response.json()
        assert [item["task_id"] for item in items] == [
            str(overdue["id"]),
            str(due_today["id"]),
            str(later["id"]),
            str(completed_old["id"]),
        ]
        by_name = {item["task_name"]: item for item in items}
        assert by_name["Overdue Task"]["overdue"] is True
        assert by_name["Overdue Task"]["action_label"] == "Overdue"
        assert by_name["Completed Old Task"]["overdue"] is False
        assert by_name["Due Today Task"]["action_label"] == "Due today"
    finally:
        database.close()


def test_my_work_is_scoped_to_current_user() -> None:
    database = _database_from_env()
    database.connect()
    try:
        first_user = _create_auth_user(database, "Scoped First", _unique_email("mywork.scopedfirst"))
        second_user = _create_auth_user(database, "Scoped Second", _unique_email("mywork.scopedsecond"))
        project = _create_project(database, first_user["id"], "Scoped Project")
        phase = _create_phase(database, project["id"], first_user["id"], "Scoped Phase", 1)
        first_task = _create_task(database, phase["id"], first_user["id"], "First User Task")
        second_task = _create_task(database, phase["id"], second_user["id"], "Second User Task")
        _add_project_member(database, project["id"], first_user["id"])
        _add_project_member(database, project["id"], second_user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            first_token = _login(client, first_user["email"])
            second_token = _login(client, second_user["email"])
            first_response = client.get("/my-work", headers=_auth_header(first_token))
            second_response = client.get("/my-work", headers=_auth_header(second_token))

        assert first_response.status_code == 200
        assert second_response.status_code == 200
        assert [item["task_id"] for item in first_response.json()] == [str(first_task["id"])]
        assert [item["task_id"] for item in second_response.json()] == [str(second_task["id"])]
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "my-work-password") -> dict:
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
                "PRJ-0000-000",
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


def _create_task(database: Database, phase_id, owner_id, name: str, due_date=None, task_status: str = "Not Started") -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO tasks (phase_id, name, owner_id, due_date, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (phase_id, name, owner_id, due_date, task_status),
        )


def _add_project_member(database: Database, project_id, user_id) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id) VALUES (%s, %s)",
            (project_id, user_id),
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


def _login(client: TestClient, email: str, password: str = "my-work-password") -> str:
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
        pytest.skip("DATABASE_URL is required for My Work API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES My Work API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-my-work-secret",
        access_token_expire_minutes=60,
    )
