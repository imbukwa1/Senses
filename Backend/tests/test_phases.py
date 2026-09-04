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


def test_pm_can_add_list_and_remove_phase_members() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Phase PM", _unique_email("phases.pm"))
        member = _create_auth_user(database, "Phase Member", _unique_email("phases.member"))
        project = _create_project(database, pm["id"], "Phase Member Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], member["id"], "Team Member")
        phase = _create_phase(database, project["id"], pm["id"], "Assigned Phase", 1)
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, pm["email"])
            created = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(token),
                json={"user_id": str(member["id"])},
            )
            listed = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(token),
            )
            removed = client.delete(
                f"/projects/{project['id']}/phases/{phase['id']}/members/{member['id']}",
                headers=_auth_header(token),
            )
            listed_after_remove = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(token),
            )

        assert created.status_code == 201
        assert created.json()["user_id"] == str(member["id"])
        assert created.json()["name"] == member["name"]
        assert listed.status_code == 200
        assert [row["user_id"] for row in listed.json()] == [str(member["id"])]
        assert removed.status_code == 204
        assert listed_after_remove.status_code == 200
        assert listed_after_remove.json() == []
    finally:
        database.close()


def test_non_pm_roles_cannot_manage_phase_members() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Phase Role PM", _unique_email("phases.rolepm"))
        team_member = _create_auth_user(database, "Phase Role Team", _unique_email("phases.roleteam"))
        finance = _create_auth_user(database, "Phase Role Finance", _unique_email("phases.rolefinance"))
        target = _create_auth_user(database, "Phase Role Target", _unique_email("phases.roletarget"))
        project = _create_project(database, pm["id"], "Phase Role Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team_member["id"], "Team Member")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        _add_project_member(database, project["id"], target["id"], "Team Member")
        phase = _create_phase(database, project["id"], pm["id"], "Restricted Phase", 1)
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            team_token = _login(client, team_member["email"])
            finance_token = _login(client, finance["email"])
            team_create = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(team_token),
                json={"user_id": str(target["id"])},
            )
            finance_create = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(finance_token),
                json={"user_id": str(target["id"])},
            )
            finance_delete = client.delete(
                f"/projects/{project['id']}/phases/{phase['id']}/members/{target['id']}",
                headers=_auth_header(finance_token),
            )

        assert team_create.status_code == 403
        assert finance_create.status_code == 403
        assert finance_delete.status_code == 403
    finally:
        database.close()


def test_phase_member_must_be_project_member_and_duplicates_conflict() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Phase Validate PM", _unique_email("phases.validatepm"))
        member = _create_auth_user(database, "Phase Validate Member", _unique_email("phases.validatemember"))
        outsider = _create_auth_user(database, "Phase Validate Outsider", _unique_email("phases.validateoutsider"))
        project = _create_project(database, pm["id"], "Phase Validation Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], member["id"], "Team Member")
        phase = _create_phase(database, project["id"], pm["id"], "Validated Phase", 1)
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, pm["email"])
            outsider_create = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(token),
                json={"user_id": str(outsider["id"])},
            )
            first_create = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(token),
                json={"user_id": str(member["id"])},
            )
            duplicate_create = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(token),
                json={"user_id": str(member["id"])},
            )

        assert outsider_create.status_code == 422
        assert first_create.status_code == 201
        assert duplicate_create.status_code == 409
    finally:
        database.close()


def test_user_can_belong_to_multiple_phases_and_visibility_respects_project_role() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Phase Visibility PM", _unique_email("phases.visibilitypm"))
        member = _create_auth_user(database, "Phase Visibility Member", _unique_email("phases.visibilitymember"))
        finance = _create_auth_user(database, "Phase Visibility Finance", _unique_email("phases.visibilityfinance"))
        project = _create_project(database, pm["id"], "Phase Visibility Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], member["id"], "Team Member")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        first_phase = _create_phase(database, project["id"], pm["id"], "Shared Active One", 1, "In Progress")
        second_phase = _create_phase(database, project["id"], pm["id"], "Shared Active Two", 2, "In Progress")
        third_phase = _create_phase(database, project["id"], pm["id"], "PM Only", 3, "In Progress")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            member_token = _login(client, member["email"])
            finance_token = _login(client, finance["email"])
            first_assignment = client.post(
                f"/projects/{project['id']}/phases/{first_phase['id']}/members",
                headers=_auth_header(pm_token),
                json={"user_id": str(member["id"])},
            )
            second_assignment = client.post(
                f"/projects/{project['id']}/phases/{second_phase['id']}/members",
                headers=_auth_header(pm_token),
                json={"user_id": str(member["id"])},
            )
            finance_assignment = client.post(
                f"/projects/{project['id']}/phases/{second_phase['id']}/members",
                headers=_auth_header(pm_token),
                json={"user_id": str(finance["id"])},
            )
            pm_list = client.get(f"/projects/{project['id']}/phases", headers=_auth_header(pm_token))
            member_list = client.get(f"/projects/{project['id']}/phases", headers=_auth_header(member_token))
            finance_dashboard = client.get(f"/projects/{project['id']}/dashboard", headers=_auth_header(finance_token))

        assert first_assignment.status_code == 201
        assert second_assignment.status_code == 201
        assert finance_assignment.status_code == 201
        assert [phase["name"] for phase in pm_list.json()] == ["Shared Active One", "Shared Active Two", "PM Only"]
        assert [phase["name"] for phase in member_list.json()] == ["Shared Active One", "Shared Active Two"]
        assert [phase["name"] for phase in finance_dashboard.json()["phases"]] == ["Shared Active Two"]
        assert [phase["status"] for phase in pm_list.json()] == ["In Progress", "In Progress", "In Progress"]
        assert third_phase["id"] not in {first_phase["id"], second_phase["id"]}
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


def _add_project_member(database: Database, project_id, user_id, role: str = "PM") -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
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
