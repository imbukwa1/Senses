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


def test_project_setup_milestones_deliverables_and_resources_use_live_records() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Setup Live PM", _unique_email("setup.live.pm"))
        team = _create_auth_user(database, "Setup Live Team", _unique_email("setup.live.team"))
        project = _create_project(database, pm["id"], "Setup Live Project")
        phase = _create_phase(database, project["id"], pm["id"], "Setup Live Phase")
        task = _create_task(database, phase["id"], pm["id"], "Setup Live Task")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team["id"], "Team Member")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            team_token = _login(client, team["email"])
            milestone = client.post(
                f"/projects/{project['id']}/setup/milestones",
                headers=_auth_header(pm_token),
                json={
                    "name": "Launch readiness",
                    "target_date": "2026-06-30",
                    "responsible_user_id": str(team["id"]),
                    "status": "In Progress",
                },
            )
            deliverable = client.post(
                f"/projects/{project['id']}/setup/deliverables",
                headers=_auth_header(pm_token),
                json={
                    "task_id": str(task["id"]),
                    "description": "Launch checklist",
                    "owner_id": str(team["id"]),
                    "due_date": "2026-06-15",
                    "acceptance_criteria": "Checklist approved",
                    "approver_id": str(pm["id"]),
                },
            )
            resource = client.post(
                f"/projects/{project['id']}/setup/resources",
                headers=_auth_header(pm_token),
                json={"resource_type": "Technology", "name": "Survey platform", "notes": "Existing tool"},
            )
            setup = client.get(f"/projects/{project['id']}/setup", headers=_auth_header(pm_token))
            team_resource_create = client.post(
                f"/projects/{project['id']}/setup/resources",
                headers=_auth_header(team_token),
                json={"resource_type": "Equipment", "name": "Denied"},
            )
            team_milestones = client.get(f"/projects/{project['id']}/setup/milestones", headers=_auth_header(team_token))
            live_deliverables = client.get(f"/projects/{project['id']}/setup/deliverables", headers=_auth_header(pm_token))
            task_checklist = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/checklist",
                headers=_auth_header(pm_token),
            )

        assert milestone.status_code == 201
        assert milestone.json()["responsible_user_id"] == str(team["id"])
        assert deliverable.status_code == 201
        assert deliverable.json()["task_id"] == str(task["id"])
        assert deliverable.json()["owner_id"] == str(team["id"])
        assert deliverable.json()["approver_id"] == str(pm["id"])
        assert resource.status_code == 201
        assert _section(setup.json(), "milestones")["status"] == "Complete"
        assert _section(setup.json(), "deliverables")["status"] == "Complete"
        assert _section(setup.json(), "resources")["status"] == "Complete"
        assert team_resource_create.status_code == 403
        assert team_milestones.status_code == 200
        assert len(team_milestones.json()) == 1
        assert len(live_deliverables.json()) == 1
        assert task_checklist.status_code == 200
        assert [item["description"] for item in task_checklist.json()["items"]] == ["Launch checklist"]
    finally:
        database.close()


def test_project_setup_risks_assumptions_and_dependencies_use_live_records() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Setup Planning PM", _unique_email("setup.planning.pm"))
        team = _create_auth_user(database, "Setup Planning Team", _unique_email("setup.planning.team"))
        project = _create_project(database, pm["id"], "Setup Planning Project")
        phase = _create_phase(database, project["id"], pm["id"], "Planning Phase")
        task = _create_task(database, phase["id"], pm["id"], "Confirm dependency")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team["id"], "Team Member")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            team_token = _login(client, team["email"])
            risk = client.post(
                f"/projects/{project['id']}/setup/risks-issues",
                headers=_auth_header(pm_token),
                json={
                    "item_type": "Risk",
                    "title": "Partner sign-off may slip",
                    "likelihood": "High",
                    "impact": "Medium",
                    "mitigation": "Weekly confirmation with partner lead.",
                    "owner_id": str(team["id"]),
                    "status": "Open",
                },
            )
            assumption = client.post(
                f"/projects/{project['id']}/setup/assumptions-constraints",
                headers=_auth_header(pm_token),
                json={
                    "entry_type": "Assumption",
                    "description": "Partner data will be available before fieldwork.",
                    "impact_notes": "Late data affects planning.",
                },
            )
            dependency = client.post(
                f"/projects/{project['id']}/setup/dependencies",
                headers=_auth_header(pm_token),
                json={
                    "description": "Partner approves participant list.",
                    "dependency_type": "External",
                    "related_phase_id": str(phase["id"]),
                    "related_task_id": str(task["id"]),
                    "responsible_user_id": str(team["id"]),
                    "responsible_party": "Partner focal point",
                    "required_by_date": "2026-05-31",
                },
            )
            setup = client.get(f"/projects/{project['id']}/setup", headers=_auth_header(pm_token))
            team_risks = client.get(f"/projects/{project['id']}/setup/risks-issues", headers=_auth_header(team_token))
            team_create_dependency = client.post(
                f"/projects/{project['id']}/setup/dependencies",
                headers=_auth_header(team_token),
                json={"description": "Denied", "dependency_type": "Internal"},
            )
            attention = client.get("/attention", headers=_auth_header(pm_token))

        assert risk.status_code == 201
        assert risk.json()["owner_id"] == str(team["id"])
        assert risk.json()["owner"]["name"] == team["name"]
        assert assumption.status_code == 201
        assert assumption.json()["description"] == "Partner data will be available before fieldwork."
        assert dependency.status_code == 201
        assert dependency.json()["related_phase_id"] == str(phase["id"])
        assert dependency.json()["related_task_id"] == str(task["id"])
        assert dependency.json()["responsible_user_id"] == str(team["id"])
        assert _section(setup.json(), "risks_issues")["status"] == "Complete"
        assert _section(setup.json(), "assumptions_constraints")["status"] == "Complete"
        assert _section(setup.json(), "dependencies")["status"] == "Complete"
        assert team_risks.status_code == 200
        assert len(team_risks.json()) == 1
        assert team_create_dependency.status_code == 403
        assert attention.status_code == 200
        assert "Risk: Partner sign-off may slip" in [item["reason"] for item in attention.json()]
    finally:
        database.close()


def test_project_setup_stakeholders_communication_and_monitoring_use_live_records() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Setup Comms PM", _unique_email("setup.comms.pm"))
        team = _create_auth_user(database, "Setup Comms Team", _unique_email("setup.comms.team"))
        project = _create_project(database, pm["id"], "Setup Comms Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team["id"], "Team Member")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            team_token = _login(client, team["email"])
            stakeholder = client.post(
                f"/projects/{project['id']}/setup/stakeholders",
                headers=_auth_header(pm_token),
                json={
                    "name": "County Health Office",
                    "organisation_group": "County government",
                    "interest_role": "Approves field activity",
                    "influence_importance": "High",
                    "engagement_notes": "Monthly coordination meeting.",
                },
            )
            communication = client.post(
                f"/projects/{project['id']}/setup/communication-plan",
                headers=_auth_header(pm_token),
                json={
                    "audience": "Project steering group",
                    "information": "Progress, blockers, budget headlines",
                    "frequency": "Monthly",
                    "responsible_user_id": str(team["id"]),
                    "method": "Review meeting",
                },
            )
            monitoring = client.post(
                f"/projects/{project['id']}/setup/monitoring-reporting",
                headers=_auth_header(pm_token),
                json={
                    "monitored_item": "Fieldwork completion",
                    "reporting_frequency": "Weekly",
                    "responsible_user_id": str(team["id"]),
                    "key_measures": "Completed interviews",
                    "reporting_notes": "Use live task progress as supporting context.",
                },
            )
            setup = client.get(f"/projects/{project['id']}/setup", headers=_auth_header(pm_token))
            team_stakeholders = client.get(f"/projects/{project['id']}/setup/stakeholders", headers=_auth_header(team_token))
            team_create_communication = client.post(
                f"/projects/{project['id']}/setup/communication-plan",
                headers=_auth_header(team_token),
                json={
                    "audience": "Denied",
                    "information": "Denied",
                    "frequency": "Weekly",
                    "method": "Email",
                },
            )

        assert stakeholder.status_code == 201
        assert stakeholder.json()["name"] == "County Health Office"
        assert communication.status_code == 201
        assert communication.json()["responsible_user_id"] == str(team["id"])
        assert communication.json()["responsible_person"]["name"] == team["name"]
        assert monitoring.status_code == 201
        assert monitoring.json()["responsible_user_id"] == str(team["id"])
        assert _section(setup.json(), "stakeholders")["status"] == "Complete"
        assert _section(setup.json(), "communication_plan")["status"] == "Complete"
        assert _section(setup.json(), "monitoring_reporting")["status"] == "Complete"
        assert team_stakeholders.status_code == 200
        assert len(team_stakeholders.json()) == 1
        assert team_create_communication.status_code == 403
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
