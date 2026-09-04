import os
from uuid import uuid4

from fastapi.testclient import TestClient
import pytest

from app.auth import hash_password
from app.config import Settings
from app.db import Database
from app.main import create_app


def test_authenticated_user_lookup_searches_by_name_and_returns_safe_fields() -> None:
    database = _database_from_env()
    database.connect()
    try:
        auth_user = _create_auth_user(database, "Lookup Actor", _unique_email("users.actor"))
        target = _create_auth_user(database, "Lookup Target", _unique_email("users.target"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, auth_user["email"])
            response = client.get("/users", params={"search": " Lookup Target "}, headers=_auth_header(token))

        assert response.status_code == 200
        matching_user = next(row for row in response.json() if row["id"] == str(target["id"]))
        assert matching_user == {
            "id": str(target["id"]),
            "name": target["name"],
            "email": target["email"],
        }
    finally:
        database.close()


def test_authenticated_user_lookup_searches_by_email_and_limits_results() -> None:
    database = _database_from_env()
    database.connect()
    try:
        auth_user = _create_auth_user(database, "Lookup Email Actor", _unique_email("users.emailactor"))
        target = _create_auth_user(database, "Lookup Email Target", _unique_email("users.emailtarget"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, auth_user["email"])
            response = client.get("/users", params={"search": target["email"].split("@")[0]}, headers=_auth_header(token))

        assert response.status_code == 200
        assert len(response.json()) <= 20
        assert any(row["id"] == str(target["id"]) for row in response.json())
    finally:
        database.close()


def test_user_lookup_rejects_unauthenticated_requests_and_blank_search_does_not_dump_users() -> None:
    database = _database_from_env()
    database.connect()
    try:
        auth_user = _create_auth_user(database, "Lookup Blank Actor", _unique_email("users.blankactor"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, auth_user["email"])
            unauthenticated = client.get("/users", params={"search": "Lookup"})
            blank = client.get("/users", params={"search": "   "}, headers=_auth_header(token))

        assert unauthenticated.status_code == 401
        assert blank.status_code == 200
        assert blank.json() == []
    finally:
        database.close()


def test_user_lookup_handles_sql_like_input_safely() -> None:
    database = _database_from_env()
    database.connect()
    try:
        auth_user = _create_auth_user(database, "Lookup Injection Actor", _unique_email("users.injectionactor"))
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            token = _login(client, auth_user["email"])
            response = client.get("/users", params={"search": "'; SELECT password_hash FROM user_credentials; --"}, headers=_auth_header(token))

        assert response.status_code == 200
        assert all(set(row) == {"id", "name", "email"} for row in response.json())
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str = "users-password") -> dict:
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


def _login(client: TestClient, email: str, password: str = "users-password") -> str:
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
        pytest.skip("DATABASE_URL is required for user lookup integration tests")

    return Database(_settings(database_url=database_url))


def _settings(database_url: str | None = None) -> Settings:
    return Settings(
        app_name="SENSES User Lookup Test API",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-users-secret",
        access_token_expire_minutes=60,
    )
