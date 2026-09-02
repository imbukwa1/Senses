import os
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app
from app.storage import FileStorageError, StoredFile


class FakeFileStorage:
    def __init__(self) -> None:
        self.objects: dict[str, StoredFile] = {}
        self.deleted_keys: list[str] = []
        self.fail_upload = False

    def upload(self, storage_key: str, content: bytes, content_type: str | None) -> None:
        if self.fail_upload:
            raise FileStorageError("File upload failed")
        self.objects[storage_key] = StoredFile(content=content, content_type=content_type)

    def download(self, storage_key: str) -> StoredFile:
        try:
            return self.objects[storage_key]
        except KeyError as exc:
            raise FileStorageError("File not found in storage") from exc

    def delete(self, storage_key: str) -> None:
        self.deleted_keys.append(storage_key)
        self.objects.pop(storage_key, None)


def test_authorized_user_can_upload_file_and_metadata_is_saved_after_storage_upload() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "File Uploader", _unique_email("files.uploader"))
        other_user = _create_auth_user(database, "Other User", _unique_email("files.other"))
        project = _create_project(database, user["id"], "File Upload Project")
        phase = _create_phase(database, project["id"], user["id"], "File Upload Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "File Upload Task")
        _add_project_member(database, project["id"], user["id"])
        storage = FakeFileStorage()
        app = create_app(
            settings=_settings(database_url=os.getenv("DATABASE_URL")),
            database=database,
            file_storage=storage,
        )

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.post(
                _files_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(token),
                data={"uploaded_by": str(other_user["id"]), "storage_key": "client-key"},
                files={"file": ("scope document.pdf", b"binary-content", "application/pdf")},
            )
            body = response.json()

            with database.session() as session:
                stored = session.fetch_one(
                    """
                    SELECT task_id, uploaded_by, file_name, storage_key, file_type, file_size
                    FROM task_files
                    WHERE id = %s
                    """,
                    (body["id"],),
                )
                audit = session.fetch_one(
                    """
                    SELECT user_id, new_values
                    FROM audit_logs
                    WHERE entity_type = 'task_files'
                      AND entity_id = %s
                      AND action = 'CREATE'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (body["id"],),
                )

        assert response.status_code == 201
        assert body["task_id"] == str(task["id"])
        assert body["uploaded_by"] == str(user["id"])
        assert body["uploader_name"] == "File Uploader"
        assert body["uploader_email"] == user["email"]
        assert body["file_name"] == "scope document.pdf"
        assert body["file_type"] == "application/pdf"
        assert body["file_size"] == len(b"binary-content")
        assert body["storage_key"].startswith(f"tasks/{task['id']}/")
        assert body["storage_key"] != "client-key"
        assert storage.objects[body["storage_key"]].content == b"binary-content"
        assert stored["task_id"] == task["id"]
        assert stored["uploaded_by"] == user["id"]
        assert stored["file_name"] == "scope document.pdf"
        assert stored["storage_key"] == body["storage_key"]
        assert stored["file_type"] == "application/pdf"
        assert stored["file_size"] == len(b"binary-content")
        assert audit["user_id"] == user["id"]
        assert audit["new_values"]["file_name"] == "scope document.pdf"
    finally:
        database.close()


def test_multiple_files_can_belong_to_one_task_and_list_with_unique_storage_keys() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "File Lister", _unique_email("files.lister"))
        project = _create_project(database, user["id"], "Multiple Files Project")
        phase = _create_phase(database, project["id"], user["id"], "Multiple Files Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Multiple Files Task")
        _add_project_member(database, project["id"], user["id"])
        storage = FakeFileStorage()
        app = create_app(
            settings=_settings(database_url=os.getenv("DATABASE_URL")),
            database=database,
            file_storage=storage,
        )

        with TestClient(app) as client:
            token = _login(client, user["email"])
            first = _upload_file(client, project["id"], phase["id"], task["id"], token, "first.txt", b"first")
            second = _upload_file(client, project["id"], phase["id"], task["id"], token, "second.txt", b"second")
            listed = client.get(
                _files_url(project["id"], phase["id"], task["id"]),
                headers=_auth_header(token),
            )

        assert first.status_code == 201
        assert second.status_code == 201
        assert listed.status_code == 200
        assert first.json()["storage_key"] != second.json()["storage_key"]
        assert [row["file_name"] for row in listed.json()] == ["first.txt", "second.txt"]
        assert len(storage.objects) == 2
    finally:
        database.close()


def test_authorized_user_can_download_file_without_public_gcs_url() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "File Downloader", _unique_email("files.downloader"))
        project = _create_project(database, user["id"], "Download File Project")
        phase = _create_phase(database, project["id"], user["id"], "Download File Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Download File Task")
        _add_project_member(database, project["id"], user["id"])
        storage = FakeFileStorage()
        app = create_app(
            settings=_settings(database_url=os.getenv("DATABASE_URL")),
            database=database,
            file_storage=storage,
        )

        with TestClient(app) as client:
            token = _login(client, user["email"])
            uploaded = _upload_file(
                client,
                project["id"],
                phase["id"],
                task["id"],
                token,
                "delivery notes.txt",
                b"downloadable",
                "text/plain",
            )
            file_id = uploaded.json()["id"]
            downloaded = client.get(
                f"{_files_url(project['id'], phase['id'], task['id'])}/{file_id}/download",
                headers=_auth_header(token),
            )

        assert downloaded.status_code == 200
        assert downloaded.content == b"downloadable"
        assert downloaded.headers["content-type"].startswith("text/plain")
        assert "delivery%20notes.txt" in downloaded.headers["content-disposition"]
        assert "storage.googleapis.com" not in downloaded.text
    finally:
        database.close()


def test_unauthorized_upload_and_download_are_rejected() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Authorized File User", _unique_email("files.authorized"))
        outsider = _create_auth_user(database, "File Outsider", _unique_email("files.outsider"))
        project = _create_project(database, user["id"], "File Access Project")
        phase = _create_phase(database, project["id"], user["id"], "File Access Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "File Access Task")
        _add_project_member(database, project["id"], user["id"])
        storage = FakeFileStorage()
        app = create_app(
            settings=_settings(database_url=os.getenv("DATABASE_URL")),
            database=database,
            file_storage=storage,
        )

        with TestClient(app) as client:
            user_token = _login(client, user["email"])
            outsider_token = _login(client, outsider["email"])
            uploaded = _upload_file(client, project["id"], phase["id"], task["id"], user_token, "private.txt", b"private")
            upload_denied = _upload_file(
                client,
                project["id"],
                phase["id"],
                task["id"],
                outsider_token,
                "blocked.txt",
                b"blocked",
            )
            download_denied = client.get(
                f"{_files_url(project['id'], phase['id'], task['id'])}/{uploaded.json()['id']}/download",
                headers=_auth_header(outsider_token),
            )
            unauthenticated = _upload_file(
                client,
                project["id"],
                phase["id"],
                task["id"],
                None,
                "anonymous.txt",
                b"anonymous",
            )

        assert uploaded.status_code == 201
        assert upload_denied.status_code == 403
        assert download_denied.status_code == 403
        assert unauthenticated.status_code == 401
        assert "blocked.txt" not in [metadata.content.decode("utf-8", errors="ignore") for metadata in storage.objects.values()]
    finally:
        database.close()


def test_missing_gcs_object_is_reported_safely() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Missing Object User", _unique_email("files.missing"))
        project = _create_project(database, user["id"], "Missing Object Project")
        phase = _create_phase(database, project["id"], user["id"], "Missing Object Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Missing Object Task")
        _add_project_member(database, project["id"], user["id"])
        with database.session() as session:
            file_metadata = session.fetch_one(
                """
                INSERT INTO task_files (task_id, uploaded_by, file_name, storage_key, file_type, file_size)
                VALUES (%s, %s, 'missing.txt', 'tasks/missing-object.txt', 'text/plain', 7)
                RETURNING id
                """,
                (task["id"], user["id"]),
            )
        app = create_app(
            settings=_settings(database_url=os.getenv("DATABASE_URL")),
            database=database,
            file_storage=FakeFileStorage(),
        )

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = client.get(
                f"{_files_url(project['id'], phase['id'], task['id'])}/{file_metadata['id']}/download",
                headers=_auth_header(token),
            )

        assert response.status_code == 502
        assert response.json()["error"]["message"] == "File not found in storage"
    finally:
        database.close()


def test_failed_storage_upload_does_not_create_database_metadata() -> None:
    database = _database_from_env()
    database.connect()
    try:
        user = _create_auth_user(database, "Failed Upload User", _unique_email("files.failed"))
        project = _create_project(database, user["id"], "Failed Upload Project")
        phase = _create_phase(database, project["id"], user["id"], "Failed Upload Phase", 1)
        task = _create_task(database, phase["id"], user["id"], "Failed Upload Task")
        _add_project_member(database, project["id"], user["id"])
        storage = FakeFileStorage()
        storage.fail_upload = True
        app = create_app(
            settings=_settings(database_url=os.getenv("DATABASE_URL")),
            database=database,
            file_storage=storage,
        )

        with TestClient(app) as client:
            token = _login(client, user["email"])
            response = _upload_file(client, project["id"], phase["id"], task["id"], token, "failed.txt", b"failed")
            with database.session() as session:
                count = session.fetch_one(
                    "SELECT COUNT(*) AS count FROM task_files WHERE task_id = %s",
                    (task["id"],),
                )

        assert response.status_code == 502
        assert response.json()["error"]["message"] == "File upload failed"
        assert count == {"count": 0}
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "file-password") -> dict:
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


def _add_project_member(database: Database, project_id, user_id) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id) VALUES (%s, %s)",
            (project_id, user_id),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _files_url(project_id, phase_id, task_id) -> str:
    return f"/projects/{project_id}/phases/{phase_id}/tasks/{task_id}/files"


def _upload_file(
    client: TestClient,
    project_id,
    phase_id,
    task_id,
    token: str | None,
    file_name: str,
    content: bytes,
    content_type: str = "text/plain",
):
    headers = _auth_header(token) if token else None
    return client.post(
        _files_url(project_id, phase_id, task_id),
        headers=headers,
        files={"file": (file_name, content, content_type)},
    )


def _login(client: TestClient, email: str, password: str = "file-password") -> str:
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
        pytest.skip("DATABASE_URL is required for task file API integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Task File API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-file-secret",
        access_token_expire_minutes=60,
    )
