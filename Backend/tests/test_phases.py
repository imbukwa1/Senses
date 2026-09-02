import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_multiple_phases_and_different_project_phase_sets_are_supported() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Phase User", _unique_email("phases.user"))
        owner = _create_auth_user(database, "Flexible Owner", _unique_email("phases.owner"))
        first_project = _create_project(database, user["id"], "First Phase Project")
        second_project = _create_project(database, user["id"], "Second Phase Project")
        _add_project_member(database, first_project["id"], user["id"])
        _add_project_member(database, second_project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            first_alpha = client.post(
                f"/projects/{first_project['id']}/phases",
                headers=_auth_header(token),
                json=_phase_payload("Discovery", 1, owner["id"]),
            )
            first_beta = client.post(
                f"/projects/{first_project['id']}/phases",
                headers=_auth_header(token),
                json=_phase_payload("Delivery", 2, owner["id"]),
            )
            second_alpha = client.post(
                f"/projects/{second_project['id']}/phases",
                headers=_auth_header(token),
                json=_phase_payload("Discovery", 1, owner["id"]),
            )
            first_list = client.get(f"/projects/{first_project['id']}/phases", headers=_auth_header(token))
            second_list = client.get(f"/projects/{second_project['id']}/phases", headers=_auth_header(token))

        assert first_alpha.status_code == 201
        assert first_beta.status_code == 201
        assert second_alpha.status_code == 201
        assert [phase["name"] for phase in first_list.json()] == ["Discovery", "Delivery"]
        assert [phase["name"] for phase in second_list.json()] == ["Discovery"]
        assert first_alpha.json()["owner_id"] == str(owner["id"])
        assert second_alpha.json()["project_id"] == str(second_project["id"])
    finally:
        database.close()


def test_phase_edit_rename_reorder_archive_complete_and_current_phase() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Phase Editor", _unique_email("phases.editor"))
        project = _create_project(database, user["id"], "Editable Phase Project")
        _add_project_member(database, project["id"], user["id"])
        phase_one = _create_phase(database, project["id"], user["id"], "Plan", 1)
        phase_two = _create_phase(database, project["id"], user["id"], "Build", 2)
        phase_three = _create_phase(database, project["id"], user["id"], "Close", 3)
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            renamed = client.patch(
                f"/projects/{project['id']}/phases/{phase_one['id']}",
                headers=_auth_header(token),
                json={"name": "Planning", "description": "Updated phase", "objectives": "Updated objective"},
            )
            completed = client.patch(
                f"/projects/{project['id']}/phases/{phase_two['id']}/complete",
                headers=_auth_header(token),
            )
            reordered = client.patch(
                f"/projects/{project['id']}/phases/reorder",
                headers=_auth_header(token),
                json={
                    "phase_ids": [
                        str(phase_three["id"]),
                        str(phase_one["id"]),
                        str(phase_two["id"]),
                    ]
                },
            )
            current = client.patch(
                f"/projects/{project['id']}/current-phase",
                headers=_auth_header(token),
                json={"phase_id": str(phase_three["id"])},
            )
            archived = client.patch(
                f"/projects/{project['id']}/phases/{phase_three['id']}/archive",
                headers=_auth_header(token),
            )
            archived_get = client.get(
                f"/projects/{project['id']}/phases/{phase_three['id']}",
                headers=_auth_header(token),
            )

            with database.session() as session:
                stored_project = session.fetch_one(
                    "SELECT current_phase_id FROM projects WHERE id = %s",
                    (project["id"],),
                )
                audit = session.fetch_one(
                    """
                    SELECT user_id, old_values, new_values
                    FROM audit_logs
                    WHERE entity_type = 'phases'
                      AND entity_id = %s
                      AND action = 'UPDATE'
                      AND old_values->>'name' = 'Plan'
                      AND new_values->>'name' = 'Planning'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (phase_one["id"],),
                )

        assert renamed.status_code == 200
        assert renamed.json()["name"] == "Planning"
        assert renamed.json()["description"] == "Updated phase"
        assert completed.status_code == 200
        assert completed.json()["status"] == "Completed"
        assert reordered.status_code == 200
        assert [phase["id"] for phase in reordered.json()] == [
            str(phase_three["id"]),
            str(phase_one["id"]),
            str(phase_two["id"]),
        ]
        assert [phase["display_order"] for phase in reordered.json()] == [1, 2, 3]
        assert current.status_code == 200
        assert current.json()["current_phase_id"] == str(phase_three["id"])
        assert archived.status_code == 200
        assert archived.json()["archived_at"] is not None
        assert archived_get.status_code == 404
        assert stored_project["current_phase_id"] is None
        assert audit["user_id"] == user["id"]
    finally:
        database.close()


def test_multiple_phases_can_remain_in_progress() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Progress Phase User", _unique_email("phases.inprogress"))
        project = _create_project(database, user["id"], "Multiple Active Phases")
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            first = client.post(
                f"/projects/{project['id']}/phases",
                headers=_auth_header(token),
                json=_phase_payload("Active One", 1, user["id"]) | {"status": "In Progress"},
            )
            second = client.post(
                f"/projects/{project['id']}/phases",
                headers=_auth_header(token),
                json=_phase_payload("Active Two", 2, user["id"]) | {"status": "In Progress"},
            )
            listed = client.get(f"/projects/{project['id']}/phases", headers=_auth_header(token))

        assert first.status_code == 201
        assert second.status_code == 201
        assert [phase["status"] for phase in listed.json()] == ["In Progress", "In Progress"]
    finally:
        database.close()


def test_cross_project_current_phase_and_unauthorized_phase_access_are_rejected() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Phase Access User", _unique_email("phases.access"))
        outsider = _create_auth_user(database, "Phase Outsider", _unique_email("phases.outsider"))
        project = _create_project(database, user["id"], "Authorized Phase Project")
        other_project = _create_project(database, user["id"], "Other Phase Project")
        phase = _create_phase(database, project["id"], user["id"], "Authorized Phase", 1)
        other_phase = _create_phase(database, other_project["id"], user["id"], "Other Phase", 1)
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            user_token = _login(client, user["email"])
            outsider_token = _login(client, outsider["email"])
            cross_project_current = client.patch(
                f"/projects/{project['id']}/current-phase",
                headers=_auth_header(user_token),
                json={"phase_id": str(other_phase["id"])},
            )
            outsider_get = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}",
                headers=_auth_header(outsider_token),
            )
            unauthenticated_create = client.post(
                f"/projects/{project['id']}/phases",
                json=_phase_payload("No Auth", 2, user["id"]),
            )

        assert cross_project_current.status_code == 404
        assert outsider_get.status_code == 403
        assert unauthenticated_create.status_code == 401
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "phase-password") -> dict:
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


def _create_phase(
    database: Database,
    project_id,
    owner_id,
    name: str,
    display_order: int,
    phase_status: str = "Not Started",
) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (project_id, name, owner_id, display_order, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
            """,
            (project_id, name, owner_id, display_order, phase_status),
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


def _phase_payload(name: str, display_order: int, owner_id) -> dict:
    return {
        "name": name,
        "description": f"{name} description",
        "owner_id": str(owner_id),
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "status": "Not Started",
        "display_order": display_order,
        "objectives": f"{name} objectives",
    }


def _login(client: TestClient, email: str, password: str = "phase-password") -> str:
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
        pytest.skip("DATABASE_URL is required for phase API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Phase API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-phase-secret",
        access_token_expire_minutes=60,
    )
