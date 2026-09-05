import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_task_can_be_created_retrieved_and_project_context_derives_through_phase() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Task User", _unique_email("tasks.user"))
        owner = _create_auth_user(database, "Task Owner", _unique_email("tasks.owner"))
        project = _create_project(database, user["id"], "Task Project")
        phase = _create_phase(database, project["id"], user["id"], "Task Phase", 1)
        _add_project_member(database, project["id"], user["id"], "PM")
        _add_project_member(database, project["id"], owner["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            created = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(token),
                json=_task_payload(owner["id"]),
            )
            body = created.json()
            fetched = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{body['id']}",
                headers=_auth_header(token),
            )
            listed = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(token),
            )

            with database.session() as session:
                audit = session.fetch_one(
                    """
                    SELECT user_id, new_values
                    FROM audit_logs
                    WHERE entity_type = 'tasks'
                      AND entity_id = %s
                      AND action = 'CREATE'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (body["id"],),
                )
                owner_phase_membership = session.fetch_one(
                    """
                    SELECT COUNT(*) AS count
                    FROM phase_members
                    WHERE phase_id = %s
                      AND user_id = %s
                    """,
                    (phase["id"], owner["id"]),
                )

        assert created.status_code == 201
        assert body["phase_id"] == str(phase["id"])
        assert body["project_id"] == str(project["id"])
        assert body["description"] == "Task created through the Section 9 API."
        assert body["owner_id"] == str(owner["id"])
        assert body["owner"] == {
            "id": str(owner["id"]),
            "name": owner["name"],
            "email": owner["email"],
        }
        assert body["priority"] == "Medium"
        assert body["status"] == "Not Started"
        assert fetched.status_code == 200
        assert fetched.json()["id"] == body["id"]
        assert [task["id"] for task in listed.json()] == [body["id"]]
        assert audit["user_id"] == user["id"]
        assert audit["new_values"]["name"] == "Section Nine Task"
        assert owner_phase_membership["count"] == 1
    finally:
        database.close()


def test_task_update_owner_priority_dates_and_status() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Task Editor", _unique_email("tasks.editor"))
        new_owner = _create_auth_user(database, "New Task Owner", _unique_email("tasks.newowner"))
        project = _create_project(database, user["id"], "Editable Task Project")
        phase = _create_phase(database, project["id"], user["id"], "Editable Task Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Editable Task")
        _add_project_member(database, project["id"], user["id"], "PM")
        _add_project_member(database, project["id"], new_owner["id"])
        today = _database_today(database)
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            updated = client.patch(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}",
                headers=_auth_header(token),
                json={
                    "name": "Updated Task",
                    "description": "Updated task description",
                    "owner_id": str(new_owner["id"]),
                    "priority": "High",
                    "start_date": str(today),
                    "due_date": str(today + timedelta(days=5)),
                },
            )
            status_updated = client.patch(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/status",
                headers=_auth_header(token),
                json={"status": "Completed"},
            )
            reopened = client.patch(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/status",
                headers=_auth_header(token),
                json={"status": "In Progress"},
            )

            with database.session() as session:
                audit = session.fetch_one(
                    """
                    SELECT user_id, old_values, new_values
                    FROM audit_logs
                    WHERE entity_type = 'tasks'
                      AND entity_id = %s
                      AND action = 'UPDATE'
                      AND old_values->>'name' = 'Editable Task'
                      AND new_values->>'name' = 'Updated Task'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (task["id"],),
                )
                owner_phase_membership = session.fetch_one(
                    """
                    SELECT COUNT(*) AS count
                    FROM phase_members
                    WHERE phase_id = %s
                      AND user_id = %s
                    """,
                    (phase["id"], new_owner["id"]),
                )

        assert updated.status_code == 200
        assert updated.json()["name"] == "Updated Task"
        assert updated.json()["owner_id"] == str(new_owner["id"])
        assert updated.json()["owner"]["name"] == "New Task Owner"
        assert updated.json()["priority"] == "High"
        assert updated.json()["start_date"] == str(today)
        assert updated.json()["due_date"] == str(today + timedelta(days=5))
        assert status_updated.status_code == 200
        assert status_updated.json()["status"] == "Completed"
        assert status_updated.json()["completed_at"] is not None
        assert reopened.status_code == 200
        assert reopened.json()["status"] == "In Progress"
        assert reopened.json()["completed_at"] is None
        assert audit["user_id"] == user["id"]
        assert owner_phase_membership["count"] == 1
    finally:
        database.close()


def test_task_supporters_can_be_added_listed_removed_and_duplicates_are_safe() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Supporter Actor", _unique_email("tasks.supporteractor"))
        supporter = _create_auth_user(database, "Task Supporter", _unique_email("tasks.supporter"))
        project = _create_project(database, user["id"], "Supporter Task Project")
        phase = _create_phase(database, project["id"], user["id"], "Supporter Task Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Supporter Task")
        _add_project_member(database, project["id"], user["id"], "PM")
        _add_project_member(database, project["id"], supporter["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            added = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/supporters",
                headers=_auth_header(token),
                json={"user_id": str(supporter["id"])},
            )
            duplicate = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/supporters",
                headers=_auth_header(token),
                json={"user_id": str(supporter["id"])},
            )
            listed = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/supporters",
                headers=_auth_header(token),
            )
            removed = client.delete(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/supporters/{supporter['id']}",
                headers=_auth_header(token),
            )
            listed_after_remove = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/supporters",
                headers=_auth_header(token),
            )
            with database.session() as session:
                supporter_phase_membership = session.fetch_one(
                    """
                    SELECT COUNT(*) AS count
                    FROM phase_members
                    WHERE phase_id = %s
                      AND user_id = %s
                    """,
                    (phase["id"], supporter["id"]),
                )

        assert added.status_code == 201
        assert added.json()["user_id"] == str(supporter["id"])
        assert added.json()["name"] == "Task Supporter"
        assert added.json()["email"] == supporter["email"]
        assert duplicate.status_code == 201
        assert duplicate.json()["user_id"] == str(supporter["id"])
        assert [row["user_id"] for row in listed.json()] == [str(supporter["id"])]
        assert supporter_phase_membership["count"] == 1
        assert removed.status_code == 204
        assert listed_after_remove.json() == []
    finally:
        database.close()


def test_task_validation_and_invalid_phase_are_rejected() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Task Validation User", _unique_email("tasks.validation"))
        project = _create_project(database, user["id"], "Task Validation Project")
        phase = _create_phase(database, project["id"], user["id"], "Task Validation Phase", 1)
        _add_project_member(database, project["id"], user["id"], "PM")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            invalid_phase = client.post(
                f"/projects/{project['id']}/phases/{uuid4()}/tasks",
                headers=_auth_header(token),
                json=_task_payload(user["id"]),
            )
            invalid_priority = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(token),
                json=_task_payload(user["id"]) | {"priority": "Urgent"},
            )
            invalid_status = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(token),
                json=_task_payload(user["id"]) | {"status": "Paused"},
            )
            invalid_project_id = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(token),
                json=_task_payload(user["id"]) | {"project_id": str(project["id"])},
            )

        assert invalid_phase.status_code == 404
        assert invalid_priority.status_code == 422
        assert invalid_status.status_code == 422
        assert invalid_project_id.status_code == 422
    finally:
        database.close()


def test_task_assignment_requires_project_member_for_owner_and_supporter() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Assignment PM", _unique_email("tasks.assignmentpm"))
        outsider = _create_auth_user(database, "Assignment Outsider", _unique_email("tasks.assignmentoutsider"))
        project = _create_project(database, pm["id"], "Assignment Validation Project")
        phase = _create_phase(database, project["id"], pm["id"], "Assignment Validation Phase", 1)
        task = _create_task(database, phase["id"], pm["id"], "Assignment Validation Task")
        _add_project_member(database, project["id"], pm["id"], "PM")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, pm["email"])
            owner_response = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(token),
                json=_task_payload(outsider["id"]),
            )
            supporter_response = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/supporters",
                headers=_auth_header(token),
                json={"user_id": str(outsider["id"])},
            )

        assert owner_response.status_code == 422
        assert owner_response.json() == {"error": {"message": "Task assignee must belong to the parent project"}}
        assert supporter_response.status_code == 422
        assert supporter_response.json() == {"error": {"message": "Task assignee must belong to the parent project"}}
    finally:
        database.close()


def test_task_assignment_management_requires_pm_role() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Assignment Role PM", _unique_email("tasks.rolepm"))
        team_member = _create_auth_user(database, "Assignment Role Team", _unique_email("tasks.roleteam"))
        finance = _create_auth_user(database, "Assignment Role Finance", _unique_email("tasks.rolefinance"))
        assignee = _create_auth_user(database, "Assignment Role Target", _unique_email("tasks.roletarget"))
        project = _create_project(database, pm["id"], "Assignment Role Project")
        phase = _create_phase(database, project["id"], pm["id"], "Assignment Role Phase", 1)
        task = _create_task(database, phase["id"], pm["id"], "Assignment Role Task")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team_member["id"], "Team Member")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        _add_project_member(database, project["id"], assignee["id"], "Team Member")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            team_token = _login(client, team_member["email"])
            finance_token = _login(client, finance["email"])

            pm_create = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(pm_token),
                json=_task_payload(assignee["id"]),
            )
            pm_supporter = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/supporters",
                headers=_auth_header(pm_token),
                json={"user_id": str(assignee["id"])},
            )
            team_create = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(team_token),
                json=_task_payload(assignee["id"]),
            )
            team_update_owner = client.patch(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}",
                headers=_auth_header(team_token),
                json={"owner_id": str(assignee["id"])},
            )
            team_supporter = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}/supporters",
                headers=_auth_header(team_token),
                json={"user_id": str(team_member["id"])},
            )
            finance_create = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(finance_token),
                json=_task_payload(assignee["id"]),
            )

        assert pm_create.status_code == 201
        assert pm_supporter.status_code == 201
        assert team_create.status_code == 403
        assert team_update_owner.status_code == 403
        assert team_supporter.status_code == 403
        assert finance_create.status_code == 403
    finally:
        database.close()


def test_task_assignment_preserves_project_role_and_multiple_phase_memberships() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Multi Phase PM", _unique_email("tasks.multiphasepm"))
        assignee = _create_auth_user(database, "Multi Phase Assignee", _unique_email("tasks.multiphaseassignee"))
        project = _create_project(database, pm["id"], "Multi Phase Assignment Project")
        first_phase = _create_phase(database, project["id"], pm["id"], "Multi Phase One", 1)
        second_phase = _create_phase(database, project["id"], pm["id"], "Multi Phase Two", 2)
        task = _create_task(database, second_phase["id"], pm["id"], "Multi Phase Task")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], assignee["id"], "Finance")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, pm["email"])
            owner_response = client.post(
                f"/projects/{project['id']}/phases/{first_phase['id']}/tasks",
                headers=_auth_header(token),
                json=_task_payload(assignee["id"]),
            )
            supporter_response = client.post(
                f"/projects/{project['id']}/phases/{second_phase['id']}/tasks/{task['id']}/supporters",
                headers=_auth_header(token),
                json={"user_id": str(assignee["id"])},
            )
            with database.session() as session:
                membership = session.fetch_one(
                    "SELECT role FROM project_members WHERE project_id = %s AND user_id = %s",
                    (project["id"], assignee["id"]),
                )
                phase_memberships = session.fetch_one(
                    """
                    SELECT COUNT(*) AS count
                    FROM phase_members
                    WHERE user_id = %s
                      AND phase_id IN (%s, %s)
                    """,
                    (assignee["id"], first_phase["id"], second_phase["id"]),
                )

        assert owner_response.status_code == 201
        assert supporter_response.status_code == 201
        assert membership == {"role": "Finance"}
        assert phase_memberships == {"count": 2}
    finally:
        database.close()


def test_task_access_is_enforced_through_project_membership() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Authorized Task User", _unique_email("tasks.authorized"))
        outsider = _create_auth_user(database, "Task Outsider", _unique_email("tasks.outsider"))
        project = _create_project(database, user["id"], "Authorized Task Project")
        phase = _create_phase(database, project["id"], user["id"], "Authorized Task Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Authorized Task")
        _add_project_member(database, project["id"], user["id"])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            user_token = _login(client, user["email"])
            outsider_token = _login(client, outsider["email"])
            authorized = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}",
                headers=_auth_header(user_token),
            )
            outsider_response = client.get(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks/{task['id']}",
                headers=_auth_header(outsider_token),
            )
            unauthenticated = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                json=_task_payload(user["id"]),
            )

        assert authorized.status_code == 200
        assert outsider_response.status_code == 403
        assert unauthenticated.status_code == 401
    finally:
        database.close()


def test_database_date_constraint_rejects_invalid_task_dates() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Task Date User", _unique_email("tasks.date"))
        project = _create_project(database, user["id"], "Task Date Project")
        phase = _create_phase(database, project["id"], user["id"], "Task Date Phase", 1)
        _add_project_member(database, project["id"], user["id"], "PM")
        today = _database_today(database)
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.post(
                f"/projects/{project['id']}/phases/{phase['id']}/tasks",
                headers=_auth_header(token),
                json=_task_payload(user["id"])
                | {
                    "start_date": str(today + timedelta(days=5)),
                    "due_date": str(today),
                },
            )

        assert response.status_code == 422
        assert response.json() == {"error": {"message": "Database constraint failed"}}
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "task-password") -> dict:
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


def _add_project_member(database: Database, project_id, user_id, role: str = "Team Member") -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _task_payload(owner_id) -> dict:
    return {
        "name": "Section Nine Task",
        "description": "Task created through the Section 9 API.",
        "owner_id": str(owner_id),
        "priority": "Medium",
        "status": "Not Started",
        "start_date": "2026-01-01",
        "due_date": "2026-12-31",
    }


def _login(client: TestClient, email: str, password: str = "task-password") -> str:
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
        pytest.skip("DATABASE_URL is required for task API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Task API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-task-secret",
        access_token_expire_minutes=60,
    )
