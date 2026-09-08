import os
from datetime import timedelta
from uuid import uuid4

from starlette.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


RESOURCE_CASES = (
    (
        "documents",
        {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Draft"}]}]},
        {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Updated"}]}]},
    ),
    (
        "spreadsheets",
        {
            "id": "workbook",
            "name": "Workbook",
            "sheetOrder": ["sheet-1"],
            "sheets": {
                "sheet-1": {
                    "id": "sheet-1",
                    "name": "Sheet1",
                    "cellData": {"0": {"0": {"v": "Draft"}}},
                },
            },
        },
        {
            "id": "workbook",
            "name": "Workbook",
            "sheetOrder": ["sheet-1"],
            "sheets": {
                "sheet-1": {
                    "id": "sheet-1",
                    "name": "Sheet1",
                    "cellData": {"0": {"0": {"v": "Updated"}}},
                },
            },
        },
    ),
)


@pytest.mark.parametrize(("resource", "initial_content", "updated_content"), RESOURCE_CASES)
def test_project_members_can_manage_native_workspace_resources(resource: str, initial_content: dict, updated_content: dict) -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _workspace_context(database)
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, context["pm"]["email"])
            team_token = _login(client, context["team"]["email"])
            root_folder = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(pm_token), json={"name": f"{resource} Root"}).json()
            child_folder = client.post(
                _folders_url(context["project"]["id"]),
                headers=_auth_header(pm_token),
                json={"name": f"{resource} Child", "parent_folder_id": root_folder["id"]},
            ).json()

            root_item = client.post(
                _resource_collection_url(context["project"]["id"], resource),
                headers=_auth_header(team_token),
                json={"name": f"{resource} Root Item", "content": initial_content, "folder_id": None, "task_id": None},
            )
            linked_item = client.post(
                _resource_collection_url(context["project"]["id"], resource),
                headers=_auth_header(team_token),
                json={
                    "name": f"{resource} Linked Item",
                    "content": initial_content,
                    "folder_id": root_folder["id"],
                    "task_id": str(context["task"]["id"]),
                },
            )
            item_id = linked_item.json()["id"]

            project_list = client.get(_resource_collection_url(context["project"]["id"], resource), headers=_auth_header(team_token))
            root_contents = client.get(_workspace_url(context["project"]["id"]), headers=_auth_header(team_token))
            folder_contents = client.get(_folder_url(context["project"]["id"], root_folder["id"]), headers=_auth_header(team_token))
            opened = client.get(_resource_item_url(context["project"]["id"], resource, item_id), headers=_auth_header(team_token))
            content_updated = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item_id)}/content",
                headers=_auth_header(team_token),
                json={"content": updated_content},
            )
            renamed = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item_id)}/name",
                headers=_auth_header(team_token),
                json={"name": f"{resource} Renamed"},
            )
            moved_to_child = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item_id)}/folder",
                headers=_auth_header(team_token),
                json={"folder_id": child_folder["id"]},
            )
            task_removed = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item_id)}/task-link",
                headers=_auth_header(team_token),
                json={"task_id": None},
            )
            task_changed = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item_id)}/task-link",
                headers=_auth_header(team_token),
                json={"task_id": str(context["second_task"]["id"])},
            )
            moved_to_root = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item_id)}/folder",
                headers=_auth_header(team_token),
                json={"folder_id": None},
            )
            deleted = client.delete(_resource_item_url(context["project"]["id"], resource, item_id), headers=_auth_header(team_token))
            missing_after_delete = client.get(_resource_item_url(context["project"]["id"], resource, item_id), headers=_auth_header(team_token))

        assert root_item.status_code == 201
        assert root_item.json()["folder_id"] is None
        assert root_item.json()["task_id"] is None
        assert linked_item.status_code == 201
        assert linked_item.json()["content"] == initial_content
        assert linked_item.json()["folder_id"] == root_folder["id"]
        assert linked_item.json()["task_id"] == str(context["task"]["id"])
        assert project_list.status_code == 200
        assert item_id in [item["id"] for item in project_list.json()]
        assert item_id in [item["id"] for item in folder_contents.json()[resource]]
        assert root_item.json()["id"] in [item["id"] for item in root_contents.json()[resource]]
        assert opened.status_code == 200
        assert opened.json()["content"] == initial_content
        assert content_updated.status_code == 200
        assert content_updated.json()["content"] == updated_content
        assert renamed.status_code == 200
        assert renamed.json()["name"] == f"{resource} Renamed"
        assert moved_to_child.status_code == 200
        assert moved_to_child.json()["folder_id"] == child_folder["id"]
        assert moved_to_child.json()["task_id"] == str(context["task"]["id"])
        assert task_removed.status_code == 200
        assert task_removed.json()["task_id"] is None
        assert task_removed.json()["folder_id"] == child_folder["id"]
        assert task_changed.status_code == 200
        assert task_changed.json()["task_id"] == str(context["second_task"]["id"])
        assert task_changed.json()["folder_id"] == child_folder["id"]
        assert moved_to_root.status_code == 200
        assert moved_to_root.json()["folder_id"] is None
        assert moved_to_root.json()["task_id"] == str(context["second_task"]["id"])
        assert deleted.status_code == 204
        assert missing_after_delete.status_code == 404
    finally:
        database.close()


@pytest.mark.parametrize(("resource", "initial_content", "_updated_content"), RESOURCE_CASES)
def test_native_workspace_resource_project_boundaries_and_link_validation(resource: str, initial_content: dict, _updated_content: dict) -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _workspace_context(database)
        other_project = _create_project(database, context["pm"]["id"], f"Other {resource} Project")
        other_phase = _create_phase(database, other_project["id"], context["pm"]["id"], f"Other {resource} Phase")
        other_task = _create_task(database, other_phase["id"], context["pm"]["id"], f"Other {resource} Task")
        _add_project_member(database, other_project["id"], context["pm"]["id"], "PM")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, context["pm"]["email"])
            outsider_token = _login(client, context["outsider"]["email"])
            folder = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(pm_token), json={"name": f"{resource} Folder"}).json()
            other_folder = client.post(_folders_url(other_project["id"]), headers=_auth_header(pm_token), json={"name": f"Other {resource} Folder"}).json()
            item = client.post(
                _resource_collection_url(context["project"]["id"], resource),
                headers=_auth_header(pm_token),
                json={"name": f"{resource} Secure Item", "content": initial_content, "folder_id": folder["id"], "task_id": str(context["task"]["id"])},
            ).json()

            outsider_list = client.get(_resource_collection_url(context["project"]["id"], resource), headers=_auth_header(outsider_token))
            outsider_create = client.post(
                _resource_collection_url(context["project"]["id"], resource),
                headers=_auth_header(outsider_token),
                json={"name": "Blocked", "content": initial_content},
            )
            cross_project_folder_create = client.post(
                _resource_collection_url(context["project"]["id"], resource),
                headers=_auth_header(pm_token),
                json={"name": "Bad Folder", "content": initial_content, "folder_id": other_folder["id"]},
            )
            cross_project_task_create = client.post(
                _resource_collection_url(context["project"]["id"], resource),
                headers=_auth_header(pm_token),
                json={"name": "Bad Task", "content": initial_content, "task_id": str(other_task["id"])},
            )
            cross_project_folder_move = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item['id'])}/folder",
                headers=_auth_header(pm_token),
                json={"folder_id": other_folder["id"]},
            )
            cross_project_task_link = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item['id'])}/task-link",
                headers=_auth_header(pm_token),
                json={"task_id": str(other_task["id"])},
            )
            malformed_name = client.patch(
                f"{_resource_item_url(context['project']['id'], resource, item['id'])}/name",
                headers=_auth_header(pm_token),
                json={"name": "bad/name"},
            )
            other_project_list = client.get(_resource_collection_url(other_project["id"], resource), headers=_auth_header(pm_token))

        assert outsider_list.status_code == 403
        assert outsider_create.status_code == 403
        assert cross_project_folder_create.status_code == 404
        assert cross_project_task_create.status_code == 404
        assert cross_project_folder_move.status_code == 404
        assert cross_project_task_link.status_code == 404
        assert malformed_name.status_code == 422
        assert item["id"] not in [other_item["id"] for other_item in other_project_list.json()]
    finally:
        database.close()


def _workspace_context(database: Database) -> dict:
    pm = _create_auth_user(database, "Native Resource PM", _unique_email("native.pm"))
    team = _create_auth_user(database, "Native Resource Team", _unique_email("native.team"))
    outsider = _create_auth_user(database, "Native Resource Outsider", _unique_email("native.outsider"))
    project = _create_project(database, pm["id"], "Native Resource Project")
    phase = _create_phase(database, project["id"], pm["id"], "Native Resource Phase")
    task = _create_task(database, phase["id"], pm["id"], "Native Resource Task")
    second_task = _create_task(database, phase["id"], pm["id"], "Native Resource Second Task")
    _add_project_member(database, project["id"], pm["id"], "PM")
    _add_project_member(database, project["id"], team["id"], "Team Member")
    return {"pm": pm, "team": team, "outsider": outsider, "project": project, "phase": phase, "task": task, "second_task": second_task}


def _create_auth_user(database: Database, name: str, email: str, password: str = "native-resource-password") -> dict:
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


def _add_project_member(database: Database, project_id, user_id, role: str) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _login(client: TestClient, email: str, password: str = "native-resource-password") -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _workspace_url(project_id) -> str:
    return f"/projects/{project_id}/workspace"


def _folders_url(project_id) -> str:
    return f"/projects/{project_id}/workspace/folders"


def _folder_url(project_id, folder_id) -> str:
    return f"/projects/{project_id}/workspace/folders/{folder_id}"


def _resource_collection_url(project_id, resource: str) -> str:
    return f"/projects/{project_id}/workspace/{resource}"


def _resource_item_url(project_id, resource: str, resource_id) -> str:
    return f"{_resource_collection_url(project_id, resource)}/{resource_id}"


def _unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid4().hex}@example.com"


def _database_from_env() -> Database:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for native workspace resource API integration tests")

    return Database(_settings(database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Native Workspace Resource API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-native-workspace-secret",
        access_token_expire_minutes=60,
    )
