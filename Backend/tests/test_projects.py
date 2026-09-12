import os
import re
from uuid import uuid4

from starlette.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_project_create_generates_code_and_sets_audit_actor() -> None:
    database = _database_from_env()
    database.connect()
    try:
        creator = _create_auth_user(database, "Project Creator", _unique_email("projects.creator"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, creator["email"])
            response = client.post(
                "/projects",
                headers=_auth_header(token),
                json=_project_payload() | {"code": "PRJ-2099-999"},
            )
            rejected_status = response.status_code
            response = client.post(
                "/projects",
                headers=_auth_header(token),
                json=_project_payload(),
            )

            assert rejected_status == 422
            assert response.status_code == 201
            body = response.json()
            assert re.fullmatch(r"PRJ-\d{4}-\d{3}", body["code"])
            assert body["code"] != "PRJ-0000-000"
            assert body["project_lead_id"] == str(creator["id"])
            assert body["project_lead"] == {
                "id": str(creator["id"]),
                "name": creator["name"],
                "email": creator["email"],
            }

            with database.session() as session:
                membership = session.fetch_one(
                    """
                    SELECT role
                    FROM project_members
                    WHERE project_id = %s
                      AND user_id = %s
                    """,
                    (body["id"], creator["id"]),
                )
                audit = session.fetch_one(
                    """
                    SELECT user_id, entity_type, action, new_values
                    FROM audit_logs
                    WHERE entity_type = 'projects'
                      AND entity_id = %s
                      AND action = 'CREATE'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (body["id"],),
                )

        assert membership == {"role": "PM"}
        assert audit["user_id"] == creator["id"]
        assert audit["new_values"]["name"] == "Section Five Project"
    finally:
        database.close()


def test_all_projects_returns_organization_overview_without_granting_project_access() -> None:
    database = _database_from_env()
    database.connect()
    try:
        member = _create_auth_user(database, "Overview Member", _unique_email("projects.overview-member"))
        other_lead = _create_auth_user(database, "Other Project Lead", _unique_email("projects.overview-lead"))
        member_project = _create_project(database, member["id"], "Member Overview Project")
        other_project = _create_project(database, other_lead["id"], "Other Overview Project")
        _add_project_member(database, member_project["id"], member["id"], "PM")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, member["email"])
            headers = _auth_header(token)
            my_projects = client.get("/projects", headers=headers)
            all_projects = client.get("/projects/all", headers=headers)
            restricted_detail = client.get(f"/projects/{other_project['id']}", headers=headers)

        assert my_projects.status_code == 200
        assert {project["id"] for project in my_projects.json()} == {str(member_project["id"])}
        assert all_projects.status_code == 200
        overview_by_id = {project["id"]: project for project in all_projects.json()}
        assert set(overview_by_id) >= {str(member_project["id"]), str(other_project["id"])}
        assert overview_by_id[str(other_project["id"])] ["health_reasons"] == []
        assert restricted_detail.status_code == 404
    finally:
        database.close()


def test_non_member_can_view_safe_project_overview_but_not_project_internals() -> None:
    database = _database_from_env()
    database.connect()
    try:
        viewer = _create_auth_user(database, "Overview Viewer", _unique_email("projects.overview-viewer"))
        project_lead = _create_auth_user(database, "Overview Lead", _unique_email("projects.overview-project-lead"))
        project = _create_project(database, project_lead["id"], "Read Only Overview Project")
        phase = _create_phase(database, project["id"], project_lead["id"], "Overview Phase")

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)
        with TestClient(app) as client:
            token = _login(client, viewer["email"])
            headers = _auth_header(token)
            overview = client.get(f"/projects/{project['id']}/overview", headers=headers)
            dashboard = client.get(f"/projects/{project['id']}/dashboard", headers=headers)
            detail = client.get(f"/projects/{project['id']}", headers=headers)
            setup = client.get(f"/projects/{project['id']}/setup", headers=headers)
            files = client.get(f"/projects/{project['id']}/files", headers=headers)
            budget = client.get(f"/projects/{project['id']}/budget", headers=headers)

        assert overview.status_code == 200
        body = overview.json()
        assert body["name"] == "Read Only Overview Project"
        assert body["description"] == "Read Only Overview Project description"
        assert body["project_lead"]["name"] == "Overview Lead"
        assert body["phases"] == [
            {
                "id": str(phase["id"]),
                "name": "Overview Phase",
                "start_date": None,
                "end_date": None,
                "status": "Not Started",
            }
        ]
        assert body["health_reasons"] == []
        assert all(response.status_code in (403, 404) for response in (dashboard, detail, setup, files, budget))
    finally:
        database.close()


def test_any_authenticated_project_role_can_create_project_without_changing_other_roles() -> None:
    database = _database_from_env()
    database.connect()
    try:
        existing_pm = _create_auth_user(database, "Existing PM", _unique_email("projects.existing-pm"))
        team_member = _create_auth_user(database, "Existing Team Member", _unique_email("projects.team-member"))
        finance = _create_auth_user(database, "Existing Finance", _unique_email("projects.finance"))
        no_prior_membership = _create_auth_user(database, "No Prior Membership", _unique_email("projects.new-user"))
        reviewer = _create_auth_user(database, "Project Reviewer", _unique_email("projects.reviewer"))
        existing_project = _create_project(database, existing_pm["id"], "Existing Role Project")
        _add_project_member(database, existing_project["id"], existing_pm["id"], "PM")
        _add_project_member(database, existing_project["id"], team_member["id"], "Team Member")
        _add_project_member(database, existing_project["id"], finance["id"], "Finance")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        created_projects = []
        with TestClient(app) as client:
            for actor in (team_member, finance, no_prior_membership):
                token = _login(client, actor["email"])
                create_response = client.post(
                    "/projects",
                    headers=_auth_header(token),
                    json=_project_payload() | {"name": f"Created by {actor['name']}"},
                )
                assert create_response.status_code == 201
                created = create_response.json()
                created_projects.append((actor, created))
                assert created["project_lead_id"] == str(actor["id"])

                member_response = client.post(
                    f"/projects/{created['id']}/members",
                    headers=_auth_header(token),
                    json={"user_id": str(reviewer["id"]), "role": "Team Member"},
                )
                assert member_response.status_code == 201

        database.connect()
        with database.session() as session:
            existing_roles = session.fetch_all(
                """
                SELECT user_id, role
                FROM project_members
                WHERE project_id = %s
                """,
                (existing_project["id"],),
            )
            for actor, created in created_projects:
                new_role = session.fetch_one(
                    """
                    SELECT role
                    FROM project_members
                    WHERE project_id = %s
                      AND user_id = %s
                    """,
                    (created["id"], actor["id"]),
                )
                assert new_role == {"role": "PM"}

        assert {row["user_id"]: row["role"] for row in existing_roles} == {
            existing_pm["id"]: "PM",
            team_member["id"]: "Team Member",
            finance["id"]: "Finance",
        }
    finally:
        database.close()


def test_project_creation_rolls_back_when_creator_membership_fails() -> None:
    database = _database_from_env()
    database.connect()
    trigger_name = "fail_restore_project_create_membership"
    function_name = "fail_restore_project_create_membership"
    try:
        creator = _create_auth_user(database, "Rollback Creator", _unique_email("projects.rollback"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)
        with database.session() as session:
            session.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON project_members")
            session.execute(f"DROP FUNCTION IF EXISTS {function_name}()")
            session.execute(
                f"""
                CREATE FUNCTION {function_name}() RETURNS trigger AS $$
                BEGIN
                  IF NEW.user_id = '{creator["id"]}'::uuid THEN
                    RAISE EXCEPTION 'forced test membership failure';
                  END IF;
                  RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
                """
            )
            session.execute(
                f"""
                CREATE TRIGGER {trigger_name}
                BEFORE INSERT ON project_members
                FOR EACH ROW EXECUTE FUNCTION {function_name}()
                """
            )

        with TestClient(app) as client:
            token = _login(client, creator["email"])
            response = client.post(
                "/projects",
                headers=_auth_header(token),
                json=_project_payload() | {"name": "Rollback Project"},
            )

        database.connect()
        with database.session() as session:
            created_project = session.fetch_one(
                "SELECT id FROM projects WHERE name = %s",
                ("Rollback Project",),
            )

        assert response.status_code == 500
        assert created_project is None
    finally:
        database.connect()
        with database.session() as session:
            session.execute(f"DROP TRIGGER IF EXISTS {trigger_name} ON project_members")
            session.execute(f"DROP FUNCTION IF EXISTS {function_name}()")
        database.close()


def test_project_can_be_listed_retrieved_updated_and_archived() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Project User", _unique_email("projects.user"))
        other_user = _create_auth_user(database, "Other Project User", _unique_email("projects.other"))
        project = _create_project(database, user["id"], "Visible API Project")
        hidden_project = _create_project(database, other_user["id"], "Hidden API Project")
        _add_project_member(database, project["id"], user["id"], "PM")

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            list_response = client.get("/projects", headers=_auth_header(token))
            get_response = client.get(f"/projects/{project['id']}", headers=_auth_header(token))
            hidden_response = client.get(f"/projects/{hidden_project['id']}", headers=_auth_header(token))
            update_response = client.patch(
                f"/projects/{project['id']}",
                headers=_auth_header(token),
                json={"name": "Updated API Project", "priority": "High"},
            )
            archive_response = client.patch(
                f"/projects/{project['id']}/archive",
                headers=_auth_header(token),
            )
            post_archive_get_response = client.get(
                f"/projects/{project['id']}",
                headers=_auth_header(token),
            )

            assert list_response.status_code == 200
            listed_ids = {row["id"] for row in list_response.json()}
            assert str(project["id"]) in listed_ids
            assert str(hidden_project["id"]) not in listed_ids

            assert get_response.status_code == 200
            assert get_response.json()["id"] == str(project["id"])
            assert hidden_response.status_code == 404

            assert update_response.status_code == 200
            assert update_response.json()["name"] == "Updated API Project"
            assert update_response.json()["priority"] == "High"

            assert archive_response.status_code == 200
            assert archive_response.json()["archived_at"] is not None
            assert post_archive_get_response.status_code == 404

            with database.session() as session:
                archived_row = session.fetch_one(
                    "SELECT id, archived_at FROM projects WHERE id = %s",
                    (project["id"],),
                )
                update_audit = session.fetch_one(
                    """
                    SELECT user_id, old_values, new_values
                    FROM audit_logs
                    WHERE entity_type = 'projects'
                      AND entity_id = %s
                      AND action = 'UPDATE'
                      AND new_values->>'name' = 'Updated API Project'
                      AND old_values->>'name' = 'Visible API Project'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (project["id"],),
                )

        assert archived_row["id"] == project["id"]
        assert archived_row["archived_at"] is not None
        assert update_audit["user_id"] == user["id"]
        assert update_audit["old_values"]["name"] == "Visible API Project"
    finally:
        database.close()


def test_project_members_can_be_added_listed_and_removed() -> None:
    database = _database_from_env()
    database.connect()
    try:
        actor = _create_auth_user(database, "Member Actor", _unique_email("projects.memberactor"))
        added = _create_auth_user(database, "Added Member", _unique_email("projects.added"))
        project = _create_project(database, actor["id"], "Membership API Project")
        _add_project_member(database, project["id"], actor["id"], role="PM")

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, actor["email"])
            add_response = client.post(
                f"/projects/{project['id']}/members",
                headers=_auth_header(token),
                json={"user_id": str(added["id"])},
            )
            list_response = client.get(
                f"/projects/{project['id']}/members",
                headers=_auth_header(token),
            )
            remove_response = client.delete(
                f"/projects/{project['id']}/members/{added['id']}",
                headers=_auth_header(token),
            )
            list_after_remove_response = client.get(
                f"/projects/{project['id']}/members",
                headers=_auth_header(token),
            )

        assert add_response.status_code == 201
        assert add_response.json()["user_id"] == str(added["id"])
        assert add_response.json()["name"] == "Added Member"
        assert add_response.json()["email"] == added["email"]
        assert add_response.json()["role"] == "Team Member"

        listed_member_ids = {row["user_id"] for row in list_response.json()}
        assert str(actor["id"]) in listed_member_ids
        assert str(added["id"]) in listed_member_ids

        assert remove_response.status_code == 204
        listed_after_remove_ids = {row["user_id"] for row in list_after_remove_response.json()}
        assert str(actor["id"]) in listed_after_remove_ids
        assert str(added["id"]) not in listed_after_remove_ids
    finally:
        database.close()


def test_project_member_assigned_to_phase_cannot_be_removed() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Phase Guard PM", _unique_email("projects.phaseguardpm"))
        assigned = _create_auth_user(database, "Phase Guard Member", _unique_email("projects.phaseguardmember"))
        project = _create_project(database, pm["id"], "Phase Guard Project")
        _add_project_member(database, project["id"], pm["id"], role="PM")
        _add_project_member(database, project["id"], assigned["id"], role="Team Member")
        phase = _create_phase(database, project["id"], pm["id"], "Guarded Phase")

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, pm["email"])
            assigned_to_phase = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/members",
                headers=_auth_header(token),
                json={"user_id": str(assigned["id"])},
            )
            remove_project_member = client.delete(
                f"/projects/{project['id']}/members/{assigned['id']}",
                headers=_auth_header(token),
            )

        assert assigned_to_phase.status_code == 201
        assert remove_project_member.status_code == 409
        assert remove_project_member.json()["error"]["message"] == "Project member is assigned to one or more phases"
    finally:
        database.close()


def test_project_member_roles_are_valid_after_migration() -> None:
    database = _database_from_env()
    database.connect()
    try:
        with database.session() as session:
            invalid_membership = session.fetch_one(
                """
                SELECT COUNT(*) AS count
                FROM project_members
                WHERE role IS NULL
                   OR role::TEXT NOT IN ('PM', 'Team Member', 'Finance')
                """
            )

        assert invalid_membership == {"count": 0}
    finally:
        database.close()


def test_project_lead_change_adds_new_lead_as_pm_member_without_demoting_previous_lead() -> None:
    database = _database_from_env()
    database.connect()
    try:
        current_lead = _create_auth_user(database, "Current Lead", _unique_email("projects.currentlead"))
        new_lead = _create_auth_user(database, "New Lead", _unique_email("projects.newlead"))
        project = _create_project(database, current_lead["id"], "Lead Change Project")
        _add_project_member(database, project["id"], current_lead["id"], role="PM")

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, current_lead["email"])
            response = client.patch(
                f"/projects/{project['id']}",
                headers=_auth_header(token),
                json={"project_lead_id": str(new_lead["id"])},
            )
            with database.session() as session:
                previous_membership = session.fetch_one(
                    "SELECT role FROM project_members WHERE project_id = %s AND user_id = %s",
                    (project["id"], current_lead["id"]),
                )
                new_membership = session.fetch_one(
                    "SELECT role FROM project_members WHERE project_id = %s AND user_id = %s",
                    (project["id"], new_lead["id"]),
                )

            assert response.status_code == 200
            assert response.json()["project_lead_id"] == str(new_lead["id"])

        assert previous_membership == {"role": "PM"}
        assert new_membership == {"role": "PM"}
    finally:
        database.close()


def test_only_pm_members_can_manage_project_members() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Membership PM", _unique_email("projects.membershippm"))
        team_member = _create_auth_user(database, "Membership Team", _unique_email("projects.membershipteam"))
        finance = _create_auth_user(database, "Membership Finance", _unique_email("projects.membershipfinance"))
        added = _create_auth_user(database, "Membership Added", _unique_email("projects.membershipadded"))
        project = _create_project(database, pm["id"], "Role Managed Project")
        _add_project_member(database, project["id"], pm["id"], role="PM")
        _add_project_member(database, project["id"], team_member["id"], role="Team Member")
        _add_project_member(database, project["id"], finance["id"], role="Finance")

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            team_token = _login(client, team_member["email"])
            finance_token = _login(client, finance["email"])
            team_add = client.post(
                f"/projects/{project['id']}/members",
                headers=_auth_header(team_token),
                json={"user_id": str(added["id"])},
            )
            finance_add = client.post(
                f"/projects/{project['id']}/members",
                headers=_auth_header(finance_token),
                json={"user_id": str(added["id"])},
            )
            pm_add = client.post(
                f"/projects/{project['id']}/members",
                headers=_auth_header(pm_token),
                json={"user_id": str(added["id"]), "role": "Finance"},
            )
            pm_update = client.patch(
                f"/projects/{project['id']}/members/{added['id']}",
                headers=_auth_header(pm_token),
                json={"role": "Team Member"},
            )
            pm_remove = client.delete(
                f"/projects/{project['id']}/members/{added['id']}",
                headers=_auth_header(pm_token),
            )

        assert team_add.status_code == 403
        assert finance_add.status_code == 403
        assert pm_add.status_code == 201
        assert pm_add.json()["role"] == "Finance"
        assert pm_update.status_code == 200
        assert pm_update.json()["role"] == "Team Member"
        assert pm_remove.status_code == 204
    finally:
        database.close()


def test_only_pm_members_can_update_or_archive_projects() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Project Admin PM", _unique_email("projects.adminpm"))
        team_member = _create_auth_user(database, "Project Admin Team", _unique_email("projects.adminteam"))
        finance = _create_auth_user(database, "Project Admin Finance", _unique_email("projects.adminfinance"))
        project = _create_project(database, pm["id"], "Project Admin Guard")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team_member["id"], "Team Member")
        _add_project_member(database, project["id"], finance["id"], "Finance")

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            team_token = _login(client, team_member["email"])
            finance_token = _login(client, finance["email"])
            team_update = client.patch(
                f"/projects/{project['id']}",
                headers=_auth_header(team_token),
                json={"name": "Team Edited Project"},
            )
            finance_archive = client.patch(
                f"/projects/{project['id']}/archive",
                headers=_auth_header(finance_token),
            )

        assert team_update.status_code == 403
        assert finance_archive.status_code == 403
    finally:
        database.close()


def test_project_lead_and_last_pm_cannot_be_removed() -> None:
    database = _database_from_env()
    database.connect()
    try:
        lead = _create_auth_user(database, "Protected Lead", _unique_email("projects.protectedlead"))
        other_pm = _create_auth_user(database, "Other PM", _unique_email("projects.otherpm"))
        normal_member = _create_auth_user(database, "Normal Member", _unique_email("projects.normalmember"))
        project = _create_project(database, lead["id"], "Protected Membership Project")
        _add_project_member(database, project["id"], lead["id"], role="PM")
        _add_project_member(database, project["id"], other_pm["id"], role="PM")
        _add_project_member(database, project["id"], normal_member["id"], role="Team Member")

        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, lead["email"])
            lead_remove = client.delete(
                f"/projects/{project['id']}/members/{lead['id']}",
                headers=_auth_header(token),
            )
            other_pm_remove = client.delete(
                f"/projects/{project['id']}/members/{other_pm['id']}",
                headers=_auth_header(token),
            )
            last_pm_demotion = client.patch(
                f"/projects/{project['id']}/members/{lead['id']}",
                headers=_auth_header(token),
                json={"role": "Team Member"},
            )
            normal_remove = client.delete(
                f"/projects/{project['id']}/members/{normal_member['id']}",
                headers=_auth_header(token),
            )

        assert lead_remove.status_code == 409
        assert other_pm_remove.status_code == 204
        assert last_pm_demotion.status_code == 409
        assert normal_remove.status_code == 204
    finally:
        database.close()


def test_project_endpoints_reject_unauthenticated_requests() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Unauth Project User", _unique_email("projects.unauth"))
        project = _create_project(database, user["id"], "Unauth API Project")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            list_response = client.get("/projects")
            get_response = client.get(f"/projects/{project['id']}")
            create_response = client.post("/projects", json=_project_payload())

        assert list_response.status_code == 401
        assert get_response.status_code == 401
        assert create_response.status_code == 401
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "project-password") -> dict:
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
            VALUES (%s, %s, %s, %s, DATE '2026-01-01', DATE '2026-12-31', 'Planning')
            RETURNING *
            """,
            ("PRJ-2026-001", name, f"{name} description", lead_id),
        )


def _create_phase(database: Database, project_id, owner_id, name: str) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (project_id, name, owner_id, display_order)
            VALUES (%s, %s, %s, 1)
            RETURNING *
            """,
            (project_id, name, owner_id),
        )


def _add_project_member(database: Database, project_id, user_id, role: str = "Team Member") -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _project_payload() -> dict:
    return {
        "name": "Section Five Project",
        "description": "Project created through the Section 5 API.",
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "status": "Planning",
        "funder_partner": "SENSES",
        "project_type": "Implementation",
        "objectives": "Validate project API foundation.",
        "priority": "Medium",
    }


def _login(client: TestClient, email: str, password: str = "project-password") -> str:
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
        pytest.skip("DATABASE_URL is required for project API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Project API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-project-secret",
        access_token_expire_minutes=60,
    )
