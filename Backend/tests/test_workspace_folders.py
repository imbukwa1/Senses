import os
from datetime import timedelta
from uuid import uuid4

from starlette.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app
from app.storage import FileStorageError, StoredFile


class FakeFileStorage:
    def __init__(self) -> None:
        self.objects: dict[str, StoredFile] = {}

    def upload(self, storage_key: str, content: bytes, content_type: str | None) -> None:
        self.objects[storage_key] = StoredFile(content=content, content_type=content_type)

    def download(self, storage_key: str) -> StoredFile:
        try:
            return self.objects[storage_key]
        except KeyError as exc:
            raise FileStorageError("File not found in storage") from exc

    def delete(self, storage_key: str) -> None:
        self.objects.pop(storage_key, None)


def test_workspace_lists_root_and_nested_folder_contents_for_project_members() -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _workspace_context(database)
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database, file_storage=FakeFileStorage())

        with TestClient(app) as client:
            pm_token = _login(client, context["pm"]["email"])
            team_token = _login(client, context["team"]["email"])
            root = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(pm_token), json={"name": "Reference"}).json()
            child = client.post(
                _folders_url(context["project"]["id"]),
                headers=_auth_header(pm_token),
                json={"name": "Field Notes", "parent_folder_id": root["id"]},
            ).json()
            uploaded = _upload_file(client, context, pm_token, "overview.pdf", b"overview", file_category="reference").json()

            root_contents = client.get(_workspace_url(context["project"]["id"]), headers=_auth_header(team_token))
            folder_contents = client.get(_folder_url(context["project"]["id"], root["id"]), headers=_auth_header(team_token))

        assert root_contents.status_code == 200
        assert [folder["name"] for folder in root_contents.json()["folders"]] == ["Reference"]
        assert [file["id"] for file in root_contents.json()["files"]] == [uploaded["id"]]
        assert folder_contents.status_code == 200
        assert [folder["id"] for folder in folder_contents.json()["folders"]] == [child["id"]]
        assert folder_contents.json()["files"] == []
    finally:
        database.close()


def test_pm_can_create_rename_move_and_delete_empty_folders() -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _workspace_context(database)
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database, file_storage=FakeFileStorage())

        with TestClient(app) as client:
            token = _login(client, context["pm"]["email"])
            source = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(token), json={"name": "Source"}).json()
            target = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(token), json={"name": "Target"}).json()
            child = client.post(
                _folders_url(context["project"]["id"]),
                headers=_auth_header(token),
                json={"name": "Child", "parent_folder_id": source["id"]},
            ).json()

            renamed = client.patch(
                _folder_url(context["project"]["id"], target["id"]),
                headers=_auth_header(token),
                json={"name": "Target Renamed"},
            )
            moved = client.patch(
                _folder_url(context["project"]["id"], child["id"]),
                headers=_auth_header(token),
                json={"parent_folder_id": target["id"]},
            )
            deleted = client.delete(_folder_url(context["project"]["id"], source["id"]), headers=_auth_header(token))

        assert renamed.status_code == 200
        assert renamed.json()["name"] == "Target Renamed"
        assert moved.status_code == 200
        assert moved.json()["parent_folder_id"] == target["id"]
        assert deleted.status_code == 204
    finally:
        database.close()


def test_workspace_folder_validation_rejects_unsafe_moves_duplicates_and_non_empty_deletes() -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _workspace_context(database)
        other_project = _create_project(database, context["pm"]["id"], "Other Workspace Project")
        _add_project_member(database, other_project["id"], context["pm"]["id"], "PM")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database, file_storage=FakeFileStorage())

        with TestClient(app) as client:
            token = _login(client, context["pm"]["email"])
            parent = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(token), json={"name": "Parent"}).json()
            child = client.post(
                _folders_url(context["project"]["id"]),
                headers=_auth_header(token),
                json={"name": "Child", "parent_folder_id": parent["id"]},
            ).json()
            other_folder = client.post(_folders_url(other_project["id"]), headers=_auth_header(token), json={"name": "Other"}).json()

            duplicate = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(token), json={"name": " parent "})
            malformed = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(token), json={"name": "bad/name"})
            cross_project_parent = client.post(
                _folders_url(context["project"]["id"]),
                headers=_auth_header(token),
                json={"name": "Bad Parent", "parent_folder_id": other_folder["id"]},
            )
            self_move = client.patch(
                _folder_url(context["project"]["id"], parent["id"]),
                headers=_auth_header(token),
                json={"parent_folder_id": parent["id"]},
            )
            descendant_move = client.patch(
                _folder_url(context["project"]["id"], parent["id"]),
                headers=_auth_header(token),
                json={"parent_folder_id": child["id"]},
            )
            non_empty_delete = client.delete(_folder_url(context["project"]["id"], parent["id"]), headers=_auth_header(token))

        assert duplicate.status_code == 409
        assert malformed.status_code == 422
        assert cross_project_parent.status_code == 404
        assert self_move.status_code == 422
        assert descendant_move.status_code == 422
        assert non_empty_delete.status_code == 409
    finally:
        database.close()


def test_pm_can_move_file_into_folder_and_back_without_changing_download_or_storage_key() -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _workspace_context(database)
        other_project = _create_project(database, context["pm"]["id"], "Other File Move Project")
        _add_project_member(database, other_project["id"], context["pm"]["id"], "PM")
        storage = FakeFileStorage()
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database, file_storage=storage)

        with TestClient(app) as client:
            token = _login(client, context["pm"]["email"])
            folder = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(token), json={"name": "Files"}).json()
            other_folder = client.post(_folders_url(other_project["id"]), headers=_auth_header(token), json={"name": "Other Files"}).json()
            uploaded = _upload_file(client, context, token, "field.txt", b"field-content").json()
            with database.session() as session:
                original_storage_key = session.fetch_one("SELECT storage_key FROM task_files WHERE id = %s", (uploaded["id"],))["storage_key"]

            cross_project_move = client.patch(
                _file_folder_url(context["project"]["id"], uploaded["id"]),
                headers=_auth_header(token),
                json={"folder_id": other_folder["id"]},
            )
            moved = client.patch(
                _file_folder_url(context["project"]["id"], uploaded["id"]),
                headers=_auth_header(token),
                json={"folder_id": folder["id"]},
            )
            folder_contents = client.get(_folder_url(context["project"]["id"], folder["id"]), headers=_auth_header(token))
            root_contents_after_move = client.get(_workspace_url(context["project"]["id"]), headers=_auth_header(token))
            downloaded = client.get(f"/projects/{context['project']['id']}/files/{uploaded['id']}/download", headers=_auth_header(token))
            moved_to_root = client.patch(
                _file_folder_url(context["project"]["id"], uploaded["id"]),
                headers=_auth_header(token),
                json={"folder_id": None},
            )
            root_contents_after_restore = client.get(_workspace_url(context["project"]["id"]), headers=_auth_header(token))
            with database.session() as session:
                updated_storage_key = session.fetch_one("SELECT storage_key FROM task_files WHERE id = %s", (uploaded["id"],))["storage_key"]

        assert cross_project_move.status_code == 404
        assert moved.status_code == 200
        assert moved.json()["folder_id"] == folder["id"]
        assert [file["id"] for file in folder_contents.json()["files"]] == [uploaded["id"]]
        assert root_contents_after_move.json()["files"] == []
        assert downloaded.status_code == 200
        assert downloaded.content == b"field-content"
        assert moved_to_root.status_code == 200
        assert moved_to_root.json()["folder_id"] is None
        assert [file["id"] for file in root_contents_after_restore.json()["files"]] == [uploaded["id"]]
        assert updated_storage_key == original_storage_key
        assert original_storage_key in storage.objects
    finally:
        database.close()


def test_workspace_folder_creation_allows_members_while_other_modifications_remain_pm_only() -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _workspace_context(database)
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database, file_storage=FakeFileStorage())

        with TestClient(app) as client:
            pm_token = _login(client, context["pm"]["email"])
            team_token = _login(client, context["team"]["email"])
            folder = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(pm_token), json={"name": "PM Folder"}).json()
            uploaded = _upload_file(client, context, pm_token, "pm.txt", b"pm").json()

            listed = client.get(_workspace_url(context["project"]["id"]), headers=_auth_header(team_token))
            create_attempt = client.post(_folders_url(context["project"]["id"]), headers=_auth_header(team_token), json={"name": "Team Folder"})
            rename_attempt = client.patch(_folder_url(context["project"]["id"], folder["id"]), headers=_auth_header(team_token), json={"name": "Rename"})
            file_move_attempt = client.patch(
                _file_folder_url(context["project"]["id"], uploaded["id"]),
                headers=_auth_header(team_token),
                json={"folder_id": folder["id"]},
            )
            delete_attempt = client.delete(_folder_url(context["project"]["id"], folder["id"]), headers=_auth_header(team_token))

        assert listed.status_code == 200
        assert create_attempt.status_code == 201
        assert rename_attempt.status_code == 403
        assert file_move_attempt.status_code == 403
        assert delete_attempt.status_code == 403
    finally:
        database.close()


def _workspace_context(database: Database) -> dict:
    pm = _create_auth_user(database, "Workspace PM", _unique_email("workspace.pm"))
    team = _create_auth_user(database, "Workspace Team", _unique_email("workspace.team"))
    project = _create_project(database, pm["id"], "Workspace Project")
    phase = _create_phase(database, project["id"], pm["id"], "Workspace Phase")
    task = _create_task(database, phase["id"], pm["id"], "Workspace Task")
    _add_project_member(database, project["id"], pm["id"], "PM")
    _add_project_member(database, project["id"], team["id"], "Team Member")
    return {"pm": pm, "team": team, "project": project, "phase": phase, "task": task}


def _create_auth_user(database: Database, name: str, email: str, password: str = "workspace-password") -> dict:
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


def _upload_file(
    client: TestClient,
    context: dict,
    token: str,
    file_name: str,
    content: bytes,
    file_category: str = "work_submission",
):
    return client.post(
        f"/projects/{context['project']['id']}/phases/{context['phase']['id']}/tasks/{context['task']['id']}/files",
        headers=_auth_header(token),
        data={"file_category": file_category},
        files={"file": (file_name, content, "text/plain")},
    )


def _login(client: TestClient, email: str, password: str = "workspace-password") -> str:
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


def _file_folder_url(project_id, file_id) -> str:
    return f"/projects/{project_id}/workspace/files/{file_id}/folder"


def _unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid4().hex}@example.com"


def _database_from_env() -> Database:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for workspace folder API integration tests")

    return Database(_settings(database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Workspace Folder API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-workspace-secret",
        access_token_expire_minutes=60,
    )
