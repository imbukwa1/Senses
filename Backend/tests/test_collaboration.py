import os
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from starlette.testclient import TestClient

from app.auth import AuthenticatedUser, create_access_token, hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_collaboration_readiness_reports_missing_services_without_database() -> None:
    app = create_app(settings=_settings(), database=FakeDatabase())

    with TestClient(app) as client:
        response = client.get("/collaboration/readiness")

    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is False
    assert body["documents"]["configured"] is False
    assert body["univer"]["configured"] is False
    assert body["shared_coordination"]["reachable"] is False


def test_document_collaboration_session_uses_project_membership_and_document_project() -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _context(database)
        other_project = _create_project(database, context["pm"]["id"], "Other Collaboration Project")
        _add_project_member(database, other_project["id"], context["pm"]["id"], "PM")
        other_document = _create_document(database, other_project["id"], context["pm"]["id"], "Other Document")
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _token(context["pm"], app.state.settings)
            outsider_token = _token(context["outsider"], app.state.settings)
            session_response = client.get(
                f"/collaboration/projects/{context['project']['id']}/documents/{context['document']['id']}/session",
                headers=_auth_header(pm_token),
            )
            outsider_response = client.get(
                f"/collaboration/projects/{context['project']['id']}/documents/{context['document']['id']}/session",
                headers=_auth_header(outsider_token),
            )
            wrong_project_response = client.get(
                f"/collaboration/projects/{context['project']['id']}/documents/{other_document['id']}/session",
                headers=_auth_header(pm_token),
            )

        assert session_response.status_code == 200
        assert session_response.json()["room"] == f"project:{context['project']['id']}:documents:{context['document']['id']}"
        assert session_response.json()["endpoint"] == "ws://127.0.0.1:1234/documents"
        assert session_response.json()["ready"] is False
        assert outsider_response.status_code == 403
        assert wrong_project_response.status_code == 404
    finally:
        database.close()


def test_spreadsheet_collaboration_session_uses_project_membership_and_official_endpoint_config() -> None:
    database = _database_from_env()
    database.connect()
    try:
        context = _context(database)
        app = create_app(settings=_settings(os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _token(context["pm"], app.state.settings)
            response = client.get(
                f"/collaboration/projects/{context['project']['id']}/spreadsheets/{context['spreadsheet']['id']}/session",
                headers=_auth_header(pm_token),
            )

        assert response.status_code == 200
        body = response.json()
        assert body["room"] == f"project:{context['project']['id']}:spreadsheets:{context['spreadsheet']['id']}"
        assert body["endpoint"] == "http://127.0.0.1:65533"
        assert body["service"]["required"] == ["UNIVER_COLLABORATION_ENDPOINT", "UNIVER_COLLABORATION_HEALTH_URL"]
    finally:
        database.close()


def test_spreadsheet_unit_mapping_uses_official_univer_endpoint_and_project_access() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Unit Mapping PM", _unique_email("unit.mapping.pm"))
        outsider = _create_auth_user(database, "Unit Mapping Outsider", _unique_email("unit.mapping.outsider"))
        project = _create_project(database, pm["id"], "Unit Mapping Project")
        other_project = _create_project(database, pm["id"], "Unit Mapping Other Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, other_project["id"], pm["id"], "PM")
        spreadsheet = _create_spreadsheet(database, project["id"], pm["id"], "Mapped Spreadsheet")
        other_spreadsheet = _create_spreadsheet(database, other_project["id"], pm["id"], "Other Spreadsheet")
        settings = replace(
            _settings(os.environ["DATABASE_URL"]),
            univer_collaboration_endpoint="http://127.0.0.1:8000",
            univer_collaboration_health_url="http://127.0.0.1:8000/universer-api/user/session-ticket",
        )
        app = create_app(settings=settings, database=database)
        pm_token = _token(pm, settings)
        outsider_token = _token(outsider, settings)

        with TestClient(app) as client:
            first = client.post(
                f"/collaboration/projects/{project['id']}/spreadsheets/{spreadsheet['id']}/unit",
                headers=_auth_header(pm_token),
            )
            second = client.post(
                f"/collaboration/projects/{project['id']}/spreadsheets/{spreadsheet['id']}/unit",
                headers=_auth_header(pm_token),
            )
            isolated = client.post(
                f"/collaboration/projects/{other_project['id']}/spreadsheets/{other_spreadsheet['id']}/unit",
                headers=_auth_header(pm_token),
            )
            outsider_response = client.post(
                f"/collaboration/projects/{project['id']}/spreadsheets/{spreadsheet['id']}/unit",
                headers=_auth_header(outsider_token),
            )
            cross_project = client.post(
                f"/collaboration/projects/{project['id']}/spreadsheets/{other_spreadsheet['id']}/unit",
                headers=_auth_header(pm_token),
            )

        assert first.status_code == 200, first.text
        assert second.status_code == 200
        assert isolated.status_code == 200
        assert first.json()["unit_id"] == second.json()["unit_id"]
        assert first.json()["unit_id"] != isolated.json()["unit_id"]
        assert outsider_response.status_code == 403
        assert cross_project.status_code == 404
    finally:
        database.close()


class FakeDatabase:
    def __init__(self) -> None:
        self.connected = False
        self.closed = False

    def connect(self) -> None:
        self.connected = True

    def close(self) -> None:
        self.closed = True


def _context(database: Database) -> dict:
    pm = _create_auth_user(database, "Collaboration PM", _unique_email("collab.pm"))
    outsider = _create_auth_user(database, "Collaboration Outsider", _unique_email("collab.outsider"))
    project = _create_project(database, pm["id"], "Collaboration Project")
    _add_project_member(database, project["id"], pm["id"], "PM")
    document = _create_document(database, project["id"], pm["id"], "Collaboration Document")
    spreadsheet = _create_spreadsheet(database, project["id"], pm["id"], "Collaboration Spreadsheet")
    return {"pm": pm, "outsider": outsider, "project": project, "document": document, "spreadsheet": spreadsheet}


def _create_auth_user(database: Database, name: str, email: str, password: str = "collaboration-password") -> dict:
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


def _add_project_member(database: Database, project_id, user_id, role: str) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _create_document(database: Database, project_id, user_id, name: str) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO workspace_documents (project_id, name, content, created_by)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (project_id, name, '{"type":"doc","content":[]}', user_id),
        )


def _create_spreadsheet(database: Database, project_id, user_id, name: str) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO workspace_spreadsheets (project_id, name, content, created_by)
            VALUES (%s, %s, %s, %s)
            RETURNING *
            """,
            (project_id, name, '{"id":"workbook","sheets":{}}', user_id),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _token(user: dict, settings: Settings) -> str:
    token, _expires_at = create_access_token(
        AuthenticatedUser(id=user["id"], name=user["name"], email=user["email"]),
        settings,
        now=datetime.now(UTC),
    )
    return token


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid4().hex}@example.com"


def _database_from_env() -> Database:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for collaboration API integration tests")

    return Database(_settings(database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Collaboration API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-collaboration-secret",
        access_token_expire_minutes=60,
        document_collaboration_health_url="http://127.0.0.1:65534/documents/health" if database_url else None,
        document_collaboration_ws_url="ws://127.0.0.1:1234/documents" if database_url else None,
        shared_coordination_url="redis://127.0.0.1:65532/0" if database_url else None,
        univer_collaboration_endpoint="http://127.0.0.1:65533" if database_url else None,
        univer_collaboration_health_url="http://127.0.0.1:65533/health" if database_url else None,
    )
