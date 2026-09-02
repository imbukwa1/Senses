import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_checklist_items_can_be_created_listed_and_counted() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Checklist User", _unique_email("checklist.user"))
        project = _create_project(database, user["id"], "Checklist Project")
        phase = _create_phase(database, project["id"], user["id"], "Checklist Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Checklist Task")
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            first = client.post(
                _checklist_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(token),
                json={"description": "First checklist item", "display_order": 1},
            )
            second = client.post(
                _checklist_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(token),
                json={"description": "Second checklist item", "display_order": 2, "is_completed": True},
            )
            listed = client.get(_checklist_url(project["id"], phase["id"], task["id"]), headers=_auth_header(token))

            with database.session() as session:
                audit = session.fetch_one(
                    """
                    SELECT user_id, new_values
                    FROM audit_logs
                    WHERE entity_type = 'task_deliverables'
                      AND entity_id = %s
                      AND action = 'CREATE'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (second.json()["id"],),
                )

        assert first.status_code == 201
        assert second.status_code == 201
        assert first.json()["completed_at"] is None
        assert second.json()["completed_at"] is not None
        assert listed.status_code == 200
        body = listed.json()
        assert body["task_id"] == str(task["id"])
        assert body["summary"] == {"completed_items": 1, "total_items": 2, "progress": "50.00"}
        assert [item["description"] for item in body["items"]] == [
            "First checklist item",
            "Second checklist item",
        ]
        assert audit["user_id"] == user["id"]
        assert audit["new_values"]["description"] == "Second checklist item"
    finally:
        database.close()


def test_checklist_item_can_be_edited_completed_unchecked_and_removed() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Checklist Editor", _unique_email("checklist.editor"))
        project = _create_project(database, user["id"], "Editable Checklist Project")
        phase = _create_phase(database, project["id"], user["id"], "Editable Checklist Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Editable Checklist Task")
        item = _create_checklist_item(database, task["id"], "Editable item", 1)
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            edited = client.patch(
                f"{_checklist_url(project['id'], phase['id'], task['id'])}/{item['id']}",
                headers=_auth_header(token),
                json={"description": "Edited item", "display_order": 2},
            )
            completed = client.patch(
                f"{_checklist_url(project['id'], phase['id'], task['id'])}/{item['id']}/completion",
                headers=_auth_header(token),
                json={"is_completed": True},
            )
            unchecked = client.patch(
                f"{_checklist_url(project['id'], phase['id'], task['id'])}/{item['id']}/completion",
                headers=_auth_header(token),
                json={"is_completed": False},
            )
            removed = client.delete(
                f"{_checklist_url(project['id'], phase['id'], task['id'])}/{item['id']}",
                headers=_auth_header(token),
            )
            listed_after_remove = client.get(
                _checklist_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(token),
            )

            with database.session() as session:
                audit = session.fetch_one(
                    """
                    SELECT user_id, old_values, new_values
                    FROM audit_logs
                    WHERE entity_type = 'task_deliverables'
                      AND entity_id = %s
                      AND action = 'UPDATE'
                      AND old_values->>'description' = 'Editable item'
                      AND new_values->>'description' = 'Edited item'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (item["id"],),
                )

        assert edited.status_code == 200
        assert edited.json()["description"] == "Edited item"
        assert edited.json()["display_order"] == 2
        assert completed.status_code == 200
        assert completed.json()["is_completed"] is True
        assert completed.json()["completed_at"] is not None
        assert unchecked.status_code == 200
        assert unchecked.json()["is_completed"] is False
        assert unchecked.json()["completed_at"] is None
        assert removed.status_code == 204
        assert listed_after_remove.json()["summary"] == {
            "completed_items": 0,
            "total_items": 0,
            "progress": "0.00",
        }
        assert listed_after_remove.json()["items"] == []
        assert audit["user_id"] == user["id"]
    finally:
        database.close()


def test_checklist_progress_uses_locked_database_rule_and_zero_checklist_status_rule_remains() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Checklist Progress", _unique_email("checklist.progress"))
        project = _create_project(database, user["id"], "Checklist Progress Project")
        phase = _create_phase(database, project["id"], user["id"], "Checklist Progress Phase", 1)
        checklist_task = _create_task(database, phase["id"], user["id"], "Checklist Progress Task")
        status_task = _create_task(database, phase["id"], user["id"], "Status Progress Task", task_status="In Progress")
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            client.post(
                _checklist_url(project["id"], phase["id"], checklist_task["id"]),
                headers=_auth_header(token),
                json={"description": "Done item", "display_order": 1, "is_completed": True},
            )
            client.post(
                _checklist_url(project["id"], phase["id"], checklist_task["id"]),
                headers=_auth_header(token),
                json={"description": "Open item", "display_order": 2},
            )
            checklist = client.get(
                _checklist_url(project["id"], phase["id"], checklist_task["id"]),
                headers=_auth_header(token),
            )
            zero_checklist = client.get(
                _checklist_url(project["id"], phase["id"], status_task["id"]),
                headers=_auth_header(token),
            )

        assert checklist.json()["summary"] == {
            "completed_items": 1,
            "total_items": 2,
            "progress": "50.00",
        }
        assert zero_checklist.json()["summary"] == {
            "completed_items": 0,
            "total_items": 0,
            "progress": "50.00",
        }
    finally:
        database.close()


def test_checklist_validation_and_unauthorized_access_are_rejected() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Checklist Access", _unique_email("checklist.access"))
        outsider = _create_auth_user(database, "Checklist Outsider", _unique_email("checklist.outsider"))
        project = _create_project(database, user["id"], "Checklist Access Project")
        phase = _create_phase(database, project["id"], user["id"], "Checklist Access Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Checklist Access Task")
        item = _create_checklist_item(database, task["id"], "Protected item", 1)
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            user_token = _login(client, user["email"])
            outsider_token = _login(client, outsider["email"])
            outsider_response = client.get(
                _checklist_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(outsider_token),
            )
            unauthenticated = client.post(
                _checklist_url(project["id"], phase["id"], task["id"]),
                json={"description": "No auth item", "display_order": 2},
            )
            invalid_task = client.post(
                _checklist_url(project["id"], phase["id"], uuid4()),
                headers=_auth_header(user_token),
                json={"description": "Invalid task item", "display_order": 2},
            )
            invalid_extra = client.patch(
                f"{_checklist_url(project['id'], phase['id'], task['id'])}/{item['id']}",
                headers=_auth_header(user_token),
                json={"description": "Edited", "progress": 100},
            )

        assert outsider_response.status_code == 403
        assert unauthenticated.status_code == 401
        assert invalid_task.status_code == 404
        assert invalid_extra.status_code == 422
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "checklist-password") -> dict:
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


def _create_task(database: Database, phase_id, owner_id, name: str, task_status: str = "Not Started") -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO tasks (phase_id, name, owner_id, status)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (phase_id, name, owner_id, task_status),
        )


def _create_checklist_item(database: Database, task_id, description: str, display_order: int) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO task_deliverables (task_id, description, display_order)
            VALUES (%s, %s, %s)
            RETURNING *
            """,
            (task_id, description, display_order),
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


def _checklist_url(project_id, phase_id, task_id) -> str:
    return f"/projects/{project_id}/phases/{phase_id}/tasks/{task_id}/checklist"


def _login(client: TestClient, email: str, password: str = "checklist-password") -> str:
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
        pytest.skip("DATABASE_URL is required for checklist API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Checklist API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-checklist-secret",
        access_token_expire_minutes=60,
    )
