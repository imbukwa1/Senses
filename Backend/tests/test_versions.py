import os
from datetime import timedelta
from uuid import uuid4

import pytest
from starlette.testclient import TestClient

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_native_workspace_versions_are_scoped_and_restore_safely() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for version integration tests")

    database = Database(_settings(database_url))
    database.connect()
    try:
        pm, viewer, outsider = _users(database)
        project = _project(database, pm["id"], "Version Project")
        other_project = _project(database, pm["id"], "Other Version Project")
        _member(database, project["id"], pm["id"], "PM")
        _member(database, project["id"], viewer["id"], "Team Member")
        _member(database, other_project["id"], pm["id"], "PM")
        document = _resource(database, "workspace_documents", project["id"], pm["id"], "Version Document")
        spreadsheet = _resource(database, "workspace_spreadsheets", project["id"], pm["id"], "Version Sheet")
        with database.session() as session:
            session.execute(
                """
                INSERT INTO workspace_collaboration_states (resource_type, resource_id, yjs_state)
                VALUES ('document', %s, %s)
                """,
                (document["id"], b"authoritative-yjs-state"),
            )

        app = create_app(settings=_settings(database_url), database=database)
        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            viewer_token = _login(client, viewer["email"])
            outsider_token = _login(client, outsider["email"])
            base = f"/projects/{project['id']}/workspace"
            doc_url = f"{base}/documents/{document['id']}"
            sheet_url = f"{base}/spreadsheets/{spreadsheet['id']}"

            document_version = client.post(f"{doc_url}/versions", headers=_auth(pm_token), json={"label": "Yjs checkpoint"})
            spreadsheet_version = client.post(f"{sheet_url}/versions", headers=_auth(pm_token), json={"label": "Sheet checkpoint"})
            document_list = client.get(f"{doc_url}/versions", headers=_auth(viewer_token))
            document_view = client.get(f"{doc_url}/versions/{document_version.json()['id']}", headers=_auth(viewer_token))
            spreadsheet_view = client.get(f"{sheet_url}/versions/{spreadsheet_version.json()['id']}", headers=_auth(viewer_token))
            restored = client.post(
                f"{sheet_url}/versions/{spreadsheet_version.json()['id']}/restore",
                headers=_auth(pm_token),
            )
            blocked_restore = client.post(
                f"{sheet_url}/versions/{spreadsheet_version.json()['id']}/restore",
                headers=_auth(viewer_token),
            )
            outsider_list = client.get(f"{doc_url}/versions", headers=_auth(outsider_token))
            wrong_resource = client.get(
                f"/projects/{other_project['id']}/workspace/documents/{document['id']}/versions",
                headers=_auth(pm_token),
            )

        assert document_version.status_code == 201
        assert document_version.json()["has_collaboration_snapshot"] is True
        assert document_list.status_code == 200
        assert document_view.status_code == 200
        assert document_view.json()["yjs_state_base64"]
        assert spreadsheet_version.status_code == 201
        assert spreadsheet_view.status_code == 200
        assert spreadsheet_view.json()["has_json_snapshot"] is True
        assert restored.status_code == 200
        assert blocked_restore.status_code == 403
        assert outsider_list.status_code == 403
        assert wrong_resource.status_code == 404
    finally:
        database.close()


def _users(database: Database) -> tuple[dict, dict, dict]:
    result = []
    with database.session() as session:
        for name in ("Version PM", "Version Viewer", "Version Outsider"):
            email = f"{name.lower().replace(' ', '.')}+{uuid4().hex}@example.com"
            user = session.fetch_one(
                "INSERT INTO users (name, email) VALUES (%s, %s) RETURNING id, name, email",
                (name, email),
            )
            session.execute(
                "INSERT INTO user_credentials (user_id, password_hash) VALUES (%s, %s)",
                (user["id"], hash_password("version-password")),
            )
            result.append(user)
    return result[0], result[1], result[2]


def _project(database: Database, lead_id, name: str) -> dict:
    with database.session() as session:
        today = session.fetch_one("SELECT CURRENT_DATE AS today")["today"]
        return session.fetch_one(
            """
            INSERT INTO projects (code, name, description, project_lead_id, start_date, end_date, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'Planning') RETURNING id
            """,
            ("PRJ-2026-001", name, name, lead_id, today, today + timedelta(days=30)),
        )


def _member(database: Database, project_id, user_id, role: str) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _resource(database: Database, table: str, project_id, user_id, name: str) -> dict:
    with database.session() as session:
        return session.fetch_one(
            f"INSERT INTO {table} (project_id, name, content, created_by) VALUES (%s, %s, '{{}}', %s) RETURNING id",
            (project_id, name, user_id),
        )


def _settings(database_url: str) -> Settings:
    return Settings(
        app_name="SENSES Version Tests",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="version-test-secret",
        access_token_expire_minutes=60,
    )


def _login(client: TestClient, email: str) -> str:
    response = client.post("/auth/login", json={"email": email, "password": "version-password"})
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
