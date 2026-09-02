import os
from uuid import uuid4

from fastapi import Depends
from fastapi.testclient import TestClient
import pytest

from app.access import (
    fetch_accessible_project,
    fetch_accessible_projects,
    require_project_access,
)
from app.auth import hash_password
from app.config import Settings
from app.db import Database, DatabaseSession
from app.dependencies import get_authenticated_db_session
from app.main import create_app


def test_authenticated_project_member_passes_project_access_check() -> None:
    database = _database_from_env()
    database.connect()
    try:
        member = _create_auth_user(database, "Access Member", _unique_email("access.member"))
        lead = _create_auth_user(database, "Access Lead", _unique_email("access.lead"))
        project = _create_project(database, lead["id"], "Member Visible Project")
        _add_project_member(database, project["id"], member["id"])

        app = _app_with_test_routes(database)

        with TestClient(app) as client:
            token = _login(client, member["email"])
            response = client.get(
                f"/test/projects/{project['id']}/access",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 200
        assert response.json() == {"project_id": str(project["id"])}
    finally:
        database.close()


def test_user_without_project_membership_is_forbidden_even_when_project_lead() -> None:
    database = _database_from_env()
    database.connect()
    try:
        lead = _create_auth_user(database, "Lead Without Membership", _unique_email("access.leadonly"))
        project = _create_project(database, lead["id"], "Lead Is Not Permission")

        app = _app_with_test_routes(database)

        with TestClient(app) as client:
            token = _login(client, lead["email"])
            response = client.get(
                f"/test/projects/{project['id']}/access",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 403
        assert response.json() == {"error": {"message": "Project access denied"}}
    finally:
        database.close()


def test_project_access_check_rejects_unauthenticated_requests() -> None:
    database = _database_from_env()
    database.connect()
    try:
        lead = _create_auth_user(database, "Unauth Lead", _unique_email("access.unauthlead"))
        project = _create_project(database, lead["id"], "Unauth Project")

        app = _app_with_test_routes(database)

        with TestClient(app) as client:
            response = client.get(f"/test/projects/{project['id']}/access")

        assert response.status_code == 401
        assert response.json() == {"error": {"message": "Invalid or expired credentials"}}
    finally:
        database.close()


def test_access_helpers_hide_inaccessible_projects_and_return_accessible_projects() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Visibility User", _unique_email("access.visible"))
        lead = _create_auth_user(database, "Visibility Lead", _unique_email("access.visiblelead"))
        accessible_project = _create_project(database, lead["id"], "Accessible Project")
        inaccessible_project = _create_project(database, lead["id"], "Inaccessible Project")
        archived_project = _create_project(database, lead["id"], "Archived Project")
        _add_project_member(database, accessible_project["id"], user["id"])
        _add_project_member(database, archived_project["id"], user["id"])
        _archive_project(database, archived_project["id"])

        with database.session() as session:
            rows = fetch_accessible_projects(session, user["id"])
            visible_ids = {row["id"] for row in rows}
            visible_project = fetch_accessible_project(session, user["id"], accessible_project["id"])
            hidden_project = fetch_accessible_project(session, user["id"], inaccessible_project["id"])
            hidden_archived_project = fetch_accessible_project(session, user["id"], archived_project["id"])

        assert accessible_project["id"] in visible_ids
        assert inaccessible_project["id"] not in visible_ids
        assert archived_project["id"] not in visible_ids
        assert visible_project["id"] == accessible_project["id"]
        assert hidden_project is None
        assert hidden_archived_project is None
    finally:
        database.close()


def test_access_checks_do_not_modify_ownership_assignments() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Multi Owner", _unique_email("access.multi"))
        project = _create_project(database, user["id"], "Multiple Ownership Roles")
        phase = _create_phase(database, project["id"], user["id"])
        task = _create_task(database, phase["id"], user["id"])
        _add_task_supporter(database, task["id"], user["id"])

        app = _app_with_test_routes(database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get(
                f"/test/projects/{project['id']}/access",
                headers={"Authorization": f"Bearer {token}"},
            )
            with database.session() as session:
                ownership = session.fetch_one(
                    """
                    SELECT
                      projects.project_lead_id,
                      phases.owner_id AS phase_owner_id,
                      tasks.owner_id AS task_owner_id,
                      COUNT(task_supporters.user_id) AS supporter_count
                    FROM projects
                    JOIN phases ON phases.project_id = projects.id
                    JOIN tasks ON tasks.phase_id = phases.id
                    LEFT JOIN task_supporters
                      ON task_supporters.task_id = tasks.id
                     AND task_supporters.user_id = %s
                    WHERE projects.id = %s
                    GROUP BY projects.project_lead_id, phases.owner_id, tasks.owner_id
                    """,
                    (user["id"], project["id"]),
                )

        assert response.status_code == 403
        assert ownership["project_lead_id"] == user["id"]
        assert ownership["phase_owner_id"] == user["id"]
        assert ownership["task_owner_id"] == user["id"]
        assert ownership["supporter_count"] == 1
    finally:
        database.close()


def _app_with_test_routes(database: Database):
    app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

    @app.get("/test/projects/{project_id}/access")
    def access_project(project_id=Depends(require_project_access)) -> dict[str, str]:
        return {"project_id": str(project_id)}

    @app.get("/test/projects")
    def list_projects(session: DatabaseSession = Depends(get_authenticated_db_session)) -> dict[str, list[str]]:
        rows = fetch_accessible_projects(session, session.actor_user_id)
        return {"project_ids": [str(row["id"]) for row in rows]}

    return app


def _create_auth_user(database: Database, name: str, email: str, password: str = "access-password") -> dict:
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
            RETURNING id, project_lead_id
            """,
            ("PRJ-2026-001", name, f"{name} description", lead_id),
        )


def _create_phase(database: Database, project_id, owner_id) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (project_id, name, owner_id, display_order)
            VALUES (%s, %s, %s, 1)
            RETURNING id, owner_id
            """,
            (project_id, "Access Phase", owner_id),
        )


def _create_task(database: Database, phase_id, owner_id) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO tasks (phase_id, name, owner_id)
            VALUES (%s, %s, %s)
            RETURNING id, owner_id
            """,
            (phase_id, "Access Task", owner_id),
        )


def _add_project_member(database: Database, project_id, user_id) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id) VALUES (%s, %s)",
            (project_id, user_id),
        )


def _archive_project(database: Database, project_id) -> None:
    with database.session() as session:
        session.execute(
            "UPDATE projects SET archived_at = NOW() WHERE id = %s",
            (project_id,),
        )


def _add_task_supporter(database: Database, task_id, user_id) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO task_supporters (task_id, user_id) VALUES (%s, %s)",
            (task_id, user_id),
        )


def _login(client: TestClient, email: str, password: str = "access-password") -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid4().hex}@example.com"


def _database_from_env() -> Database:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for access integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Access Test API",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-access-secret",
        access_token_expire_minutes=60,
    )
