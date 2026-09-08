import os
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from starlette.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_project_budget_defaults_are_safe_for_projects() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Budget Default PM", _unique_email("budget.defaultpm"))
        project = _create_project(database, pm["id"], "Budget Default Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, pm["email"])
            response = client.get(f"/projects/{project['id']}/budget", headers=_auth_header(token))

        assert response.status_code == 200
        assert_budget(response.json(), allocated="0", spent="0", remaining="0", utilisation="0")
    finally:
        database.close()


def test_finance_can_edit_project_allocated_and_pm_can_view_read_only() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Budget PM", _unique_email("budget.pm"))
        finance = _create_auth_user(database, "Budget Finance", _unique_email("budget.finance"))
        project = _create_project(database, pm["id"], "Budget Editable Project")
        phase = _create_phase(database, project["id"], "Budget Editable Phase")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        _set_phase_budget(database, phase["id"], allocated="500.00", spent="250.00")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            finance_token = _login(client, finance["email"])
            pm_view = client.get(f"/projects/{project['id']}/budget", headers=_auth_header(pm_token))
            pm_update = client.patch(
                f"/projects/{project['id']}/budget",
                headers=_auth_header(pm_token),
                json={"allocated": "1200.00"},
            )
            finance_update = client.patch(
                f"/projects/{project['id']}/budget",
                headers=_auth_header(finance_token),
                json={"allocated": "1000.00"},
            )
            finance_spent_rejected = client.patch(
                f"/projects/{project['id']}/budget",
                headers=_auth_header(finance_token),
                json={"spent": "400.00"},
            )

        assert pm_view.status_code == 200
        assert_budget(pm_view.json(), allocated="0", spent="250", remaining="-250", utilisation="0")
        assert pm_update.status_code == 403
        assert finance_update.status_code == 200
        assert_budget(finance_update.json(), allocated="1000", spent="250", remaining="750", utilisation="0.25")
        assert finance_spent_rejected.status_code == 422
    finally:
        database.close()


def test_finance_can_edit_phase_budget_and_project_totals_are_derived() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Phase Budget PM", _unique_email("budget.phasepm"))
        finance = _create_auth_user(database, "Phase Budget Finance", _unique_email("budget.phasefinance"))
        project = _create_project(database, pm["id"], "Phase Budget Project")
        first_phase = _create_phase(database, project["id"], "Phase Budget One")
        second_phase = _create_phase(database, project["id"], "Phase Budget Two", display_order=2)
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            finance_token = _login(client, finance["email"])
            project_update = client.patch(
                f"/projects/{project['id']}/budget",
                headers=_auth_header(finance_token),
                json={"allocated": "1000.00"},
            )
            first_update = client.patch(
                f"/projects/{project['id']}/phases/{first_phase['id']}/budget",
                headers=_auth_header(finance_token),
                json={"allocated": "500.00", "spent": "125.00"},
            )
            second_update = client.patch(
                f"/projects/{project['id']}/phases/{second_phase['id']}/budget",
                headers=_auth_header(finance_token),
                json={"allocated": "250.00", "spent": "75.00"},
            )
            project_budget = client.get(f"/projects/{project['id']}/budget", headers=_auth_header(finance_token))

        assert project_update.status_code == 200
        assert first_update.status_code == 200
        assert_phase_budget(first_update.json(), allocated="500", spent="125", remaining="375", utilisation="0.25")
        assert second_update.status_code == 200
        assert_phase_budget(second_update.json(), allocated="250", spent="75", remaining="175", utilisation="0.3")
        assert_budget(project_budget.json(), allocated="1000", spent="200", remaining="800", utilisation="0.2")
    finally:
        database.close()


def test_team_member_cannot_edit_project_budget_and_project_access_is_enforced() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Budget Access PM", _unique_email("budget.accesspm"))
        team_member = _create_auth_user(database, "Budget Team", _unique_email("budget.team"))
        outsider = _create_auth_user(database, "Budget Outsider", _unique_email("budget.outsider"))
        project = _create_project(database, pm["id"], "Budget Access Project")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], team_member["id"], "Team Member")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            team_token = _login(client, team_member["email"])
            outsider_token = _login(client, outsider["email"])
            team_view = client.get(f"/projects/{project['id']}/budget", headers=_auth_header(team_token))
            team_update = client.patch(
                f"/projects/{project['id']}/budget",
                headers=_auth_header(team_token),
                json={"allocated": "100.00"},
            )
            outsider_view = client.get(f"/projects/{project['id']}/budget", headers=_auth_header(outsider_token))

        assert team_view.status_code == 403
        assert team_update.status_code == 403
        assert team_update.json() == {"error": {"message": "Project PM or Finance role is required"}}
        assert outsider_view.status_code == 403
        assert outsider_view.json() == {"error": {"message": "Project access denied"}}
    finally:
        database.close()


def test_negative_budget_values_are_rejected() -> None:
    database = _database_from_env()
    database.connect()
    try:
        finance = _create_auth_user(database, "Budget Negative Finance", _unique_email("budget.negativefinance"))
        project = _create_project(database, finance["id"], "Budget Negative Project")
        phase = _create_phase(database, project["id"], "Budget Negative Phase")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, finance["email"])
            project_response = client.patch(
                f"/projects/{project['id']}/budget",
                headers=_auth_header(token),
                json={"allocated": "-1.00"},
            )
            phase_response = client.patch(
                f"/projects/{project['id']}/phases/{phase['id']}/budget",
                headers=_auth_header(token),
                json={"spent": "-1.00"},
            )

        assert project_response.status_code == 422
        assert phase_response.status_code == 422
    finally:
        database.close()


def test_project_budget_handles_zero_allocated_safely() -> None:
    database = _database_from_env()
    database.connect()
    try:
        finance = _create_auth_user(database, "Budget Zero Finance", _unique_email("budget.zerofinance"))
        project = _create_project(database, finance["id"], "Budget Zero Project")
        phase = _create_phase(database, project["id"], "Budget Zero Phase")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, finance["email"])
            phase_response = client.patch(
                f"/projects/{project['id']}/phases/{phase['id']}/budget",
                headers=_auth_header(token),
                json={"allocated": "0.00", "spent": "125.00"},
            )
            project_response = client.get(f"/projects/{project['id']}/budget", headers=_auth_header(token))

        assert phase_response.status_code == 200
        assert_phase_budget(phase_response.json(), allocated="0", spent="125", remaining="-125", utilisation="0")
        assert_budget(project_response.json(), allocated="0", spent="125", remaining="-125", utilisation="0")
    finally:
        database.close()


def test_attention_includes_budget_overrun_for_pm_and_finance() -> None:
    database = _database_from_env()
    database.connect()
    try:
        pm = _create_auth_user(database, "Budget Attention PM", _unique_email("budget.attentionpm"))
        finance = _create_auth_user(database, "Budget Attention Finance", _unique_email("budget.attentionfinance"))
        team_member = _create_auth_user(database, "Budget Attention Team", _unique_email("budget.attentionteam"))
        project = _create_project(database, pm["id"], "Budget Attention Project")
        phase = _create_phase(database, project["id"], "Budget Attention Phase")
        _add_project_member(database, project["id"], pm["id"], "PM")
        _add_project_member(database, project["id"], finance["id"], "Finance")
        _add_project_member(database, project["id"], team_member["id"], "Team Member")
        _set_budget(database, project["id"], allocated="100.00")
        _set_phase_budget(database, phase["id"], allocated="200.00", spent="150.00")
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            pm_token = _login(client, pm["email"])
            finance_token = _login(client, finance["email"])
            team_token = _login(client, team_member["email"])
            pm_response = client.get("/attention", headers=_auth_header(pm_token))
            finance_response = client.get("/attention", headers=_auth_header(finance_token))
            team_response = client.get("/attention", headers=_auth_header(team_token))

        assert budget_attention_reasons(pm_response.json()) == ["Project budget is over allocated amount"]
        assert budget_attention_reasons(finance_response.json()) == ["Project budget is over allocated amount"]
        assert budget_attention_reasons(team_response.json()) == []
    finally:
        database.close()


def assert_budget(body: dict, *, allocated: str, spent: str, remaining: str, utilisation: str) -> None:
    assert Decimal(str(body["allocated"])) == Decimal(allocated)
    assert Decimal(str(body["spent"])) == Decimal(spent)
    assert Decimal(str(body["remaining"])) == Decimal(remaining)
    assert Decimal(str(body["utilisation"])) == Decimal(utilisation)


def assert_phase_budget(body: dict, *, allocated: str, spent: str, remaining: str, utilisation: str) -> None:
    assert Decimal(str(body["budget_allocated"])) == Decimal(allocated)
    assert Decimal(str(body["budget_spent"])) == Decimal(spent)
    assert Decimal(str(body["budget_remaining"])) == Decimal(remaining)
    assert Decimal(str(body["budget_utilisation"])) == Decimal(utilisation)


def budget_attention_reasons(items: list[dict]) -> list[str]:
    return [
        item["reason"]
        for item in items
        if item["type"] == "project" and item["reason"] == "Project budget is over allocated amount"
    ]


def _create_auth_user(database: Database, name: str, email: str, password: str = "budget-password") -> dict:
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
                "PRJ-0000-000",
                name,
                f"{name} description",
                lead_id,
                today,
                today + timedelta(days=30),
            ),
        )


def _create_phase(database: Database, project_id, name: str, display_order: int = 1) -> dict:
    with database.session() as session:
        return session.fetch_one(
            """
            INSERT INTO phases (project_id, name, display_order, status)
            VALUES (%s, %s, %s, 'In Progress')
            RETURNING *
            """,
            (project_id, name, display_order),
        )


def _add_project_member(database: Database, project_id, user_id, role: str) -> None:
    with database.session() as session:
        session.execute(
            "INSERT INTO project_members (project_id, user_id, role) VALUES (%s, %s, %s)",
            (project_id, user_id, role),
        )


def _set_budget(database: Database, project_id, *, allocated: str) -> None:
    with database.session() as session:
        session.execute(
            """
            UPDATE projects
            SET budget_allocated = %s
            WHERE id = %s
            """,
            (allocated, project_id),
        )


def _set_phase_budget(database: Database, phase_id, *, allocated: str, spent: str) -> None:
    with database.session() as session:
        session.execute(
            """
            UPDATE phases
            SET budget_allocated = %s,
                budget_spent = %s
            WHERE id = %s
            """,
            (allocated, spent, phase_id),
        )


def _database_today(database: Database):
    with database.session() as session:
        return session.fetch_one("SELECT CURRENT_DATE AS today")["today"]


def _login(client: TestClient, email: str, password: str = "budget-password") -> str:
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
        pytest.skip("DATABASE_URL is required for project budget integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES Project Budget API Test",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-project-budget-secret",
        access_token_expire_minutes=60,
    )
