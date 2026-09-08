import os
from uuid import uuid4

import pytest
from starlette.testclient import TestClient

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_project_setup_reads_live_project_data_and_optional_statuses() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Setup PM", _unique_email("setup.pm"))
        project = _create_project(
            database,
            pm["id"],
            "Live Setup Project",
            objectives="Use live project data.",
            expected_outcomes="Setup is visible.",
            success_criteria="Sections are data driven.",
            work_plan_details="Use the live project workflow.",
            key_activities="Inspect\nValidate",
        )
        phase = _create_phase(database, project["id"], pm["id"], "Implementation")
        task = _create_task(database, phase["id"], pm["id"], "Build setup shell")
        _create_deliverable(database, task["id"], "Validate setup")
        _add_project_member(database, project["id"], pm["id"], "PM")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, pm["email"])
            response = client.get(f"/projects/{project['id']}/setup", headers=_auth_header(token))
            not_applicable = client.patch(
                f"/projects/{project['id']}/setup/sections/risks_issues",
                headers=_auth_header(token),
                json={"status": "Not Applicable"},
            )
            dashboard = client.get(f"/projects/{project['id']}/dashboard", headers=_auth_header(token))

        assert response.status_code == 200
        body = response.json()
        assert body["project_id"] == str(project["id"])
        assert len(body["sections"]) == 22
        assert _section(body, "project_overview")["status"] == "Complete"
        assert _section(body, "objectives_outcomes")["status"] == "Complete"
        assert _section(body, "work_plan")["status"] == "Complete"
        assert _section(body, "phases")["status"] == "Complete"
        assert _section(body, "deliverables")["status"] == "Complete"
        assert body["summary"]["percent_complete"] < 100

        assert not_applicable.status_code == 200
        assert _section(not_applicable.json(), "risks_issues")["status"] == "Not Applicable"
        assert dashboard.status_code == 200
        assert dashboard.json()["setup"]["summary"]["total_applicable_sections"] == 21
    finally:
        database.close()


def test_project_setup_editing_is_pm_only_and_never_blocks_project_work() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Setup Guard PM", _unique_email("setup.guard.pm"))
        team = _create_auth_user(database, "Setup Guard Team", _unique_email("setup.guard.team"))
        project = _create_project(database, pm["id"], "Setup Guard Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team["id"], "Team Member")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            team_token = _login(client, team["email"])
            team_view = client.get(f"/projects/{project['id']}/setup", headers=_auth_header(team_token))
            team_edit = client.patch(
                f"/projects/{project['id']}/setup/sections/notes",
                headers=_auth_header(team_token),
                json={"status": "Complete"},
            )
            core_not_applicable = client.patch(
                f"/projects/{project['id']}/setup/sections/project_overview",
                headers=_auth_header(pm_token),
                json={"status": "Not Applicable"},
            )
            phase_create = client.post(
                f"/projects/{project['id']}/phases",
                headers=_auth_header(pm_token),
                json={
                    "name": "Still Allowed",
                    "owner_id": str(pm["id"]),
                    "status": "Not Started",
                    "display_order": 1,
                },
            )

        assert team_view.status_code == 200
        assert team_edit.status_code == 403
        assert core_not_applicable.status_code == 422
        assert phase_create.status_code == 201
    finally:
        database.close()


def test_project_setup_first_sections_update_live_project_data_and_completion() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Setup Detail PM", _unique_email("setup.detail.pm"))
        project = _create_project(database, pm["id"], "Setup Detail Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, pm["email"])
            overview = client.patch(
                f"/projects/{project['id']}/setup/project-overview",
                headers=_auth_header(token),
                json={
                    "name": "Updated Detail Project",
                    "description": "Updated project purpose.",
                    "start_date": "2026-02-01",
                    "end_date": "2026-11-30",
                    "project_location_area": "Nairobi",
                },
            )
            readonly_code = client.patch(
                f"/projects/{project['id']}/setup/project-overview",
                headers=_auth_header(token),
                json={
                    "name": "Updated Detail Project",
                    "code": "SHOULD-NOT-CHANGE",
                    "description": "Updated project purpose.",
                    "start_date": "2026-02-01",
                    "end_date": "2026-11-30",
                },
            )
            scope = client.patch(
                f"/projects/{project['id']}/setup/scope",
                headers=_auth_header(token),
                json={
                    "scope_in": "Discovery and delivery",
                    "scope_out": "Long-term operations",
                    "scope_boundaries": "Pilot geography only",
                    "scope_notes": "Review after launch",
                },
            )
            objectives = client.patch(
                f"/projects/{project['id']}/setup/objectives-outcomes",
                headers=_auth_header(token),
                json={
                    "objectives": "Improve reporting",
                    "expected_outcomes": "Teams can track delivery",
                    "success_criteria": "Weekly dashboards are current",
                    "key_indicators": "Completion rate",
                },
            )
            work_plan = client.patch(
                f"/projects/{project['id']}/setup/work-plan",
                headers=_auth_header(token),
                json={
                    "work_plan_details": "Run setup and implementation in parallel.",
                    "start_date": "2026-02-01",
                    "end_date": "2026-11-30",
                    "key_activities": "Plan\nBuild\nReview",
                },
            )
            dashboard = client.get(f"/projects/{project['id']}/dashboard", headers=_auth_header(token))

        assert overview.status_code == 200
        assert overview.json()["details"]["project_overview"]["code"] == project["code"]
        assert readonly_code.status_code == 422
        assert scope.status_code == 200
        assert objectives.status_code == 200
        assert work_plan.status_code == 200
        setup = work_plan.json()
        assert _section(setup, "project_overview")["status"] == "Complete"
        assert _section(setup, "scope")["status"] == "Complete"
        assert _section(setup, "objectives_outcomes")["status"] == "Complete"
        assert _section(setup, "work_plan")["status"] == "Complete"
        assert setup["summary"]["complete_sections"] >= 4
        assert dashboard.status_code == 200
        assert dashboard.json()["project"]["name"] == "Updated Detail Project"
        assert dashboard.json()["project"]["start_date"] == "2026-02-01"
        assert dashboard.json()["project"]["end_date"] == "2026-11-30"
    finally:
        database.close()


def test_project_setup_first_section_completion_is_data_driven_and_pm_only() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Setup Derived PM", _unique_email("setup.derived.pm"))
        team = _create_auth_user(database, "Setup Derived Team", _unique_email("setup.derived.team"))
        project = _create_project(database, pm["id"], "Setup Derived Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team["id"], "Team Member")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            team_token = _login(client, team["email"])
            draft_scope = client.patch(
                f"/projects/{project['id']}/setup/scope",
                headers=_auth_header(pm_token),
                json={"scope_in": "Included"},
            )
            premature_complete = client.patch(
                f"/projects/{project['id']}/setup/sections/scope",
                headers=_auth_header(pm_token),
                json={"status": "Complete"},
            )
            team_edit = client.patch(
                f"/projects/{project['id']}/setup/scope",
                headers=_auth_header(team_token),
                json={"scope_in": "Denied", "scope_out": "Denied", "scope_boundaries": "Denied"},
            )

        assert draft_scope.status_code == 200
        assert _section(draft_scope.json(), "scope")["status"] == "In Progress"
        assert premature_complete.status_code == 422
        assert team_edit.status_code == 403
    finally:
        database.close()


def _section(setup: dict, key: str) -> dict:
    return next(section for section in setup["sections"] if section["key"] == key)


def _create_auth_user(database: Database, name: str, email: str, password: str = "setup-password") -> dict:
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
    objectives: str | None = None,
    expected_outcomes: str | None = None,
    success_criteria: str | None = None,
    work_plan_details: str | None = None,
    key_activities: str | None = None,
) -> dict:
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
              status,
              objectives,
              expected_outcomes,
              success_criteria,
              work_plan_details,
              key_activities
            )
            VALUES (%s, %s, %s, %s, DATE '2026-01-01', DATE '2026-12-31', 'Planning', %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                f"PRJ-{uuid4().hex[:8].upper()}",
                name,
                f"{name} description",
                lead_id,
                objectives,
                expected_outcomes,
                success_criteria,
                work_plan_details,
                key_activities,
            ),
        )


def _create_phase(database: Database, project_id, owner_id, name: str) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (project_id, name, owner_id, display_order, start_date, end_date)
            VALUES (%s, %s, %s, 1, DATE '2026-01-01', DATE '2026-03-31')
            RETURNING *
            """,
            (project_id, name, owner_id),
        )


def _create_task(database: Database, phase_id, owner_id, name: str) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO tasks (phase_id, name, owner_id)
            VALUES (%s, %s, %s)
            RETURNING *
            """,
            (phase_id, name, owner_id),
        )


def _create_deliverable(database: Database, task_id, description: str) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO task_deliverables (task_id, description, display_order)
            VALUES (%s, %s, 1)
            RETURNING *
            """,
            (task_id, description),
        )


def _add_project_member(database: Database, project_id, user_id, role: str) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _login(client: TestClient, email: str, password: str = "setup-password") -> str:
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
        pytest.skip("DATABASE_URL is required for project setup integration tests")

    return Database(_settings(database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Project Setup Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-project-setup-secret",
        access_token_expire_minutes=60,
    )
