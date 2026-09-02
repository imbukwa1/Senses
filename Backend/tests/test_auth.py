from datetime import UTC, datetime, timedelta
import os
from uuid import UUID, uuid4

from fastapi import Depends
from fastapi.testclient import TestClient
import pytest

from app.auth import (
    AuthenticatedUser,
    create_access_token,
    get_current_user,
    hash_password,
    verify_access_token,
)
from app.config import Settings
from app.db import Database, DatabaseSession
from app.dependencies import get_authenticated_db_session
from app.main import create_app


def test_invalid_token_is_rejected() -> None:
    with pytest.raises(Exception):
        verify_access_token("not-a-valid-token", _settings())


def test_expired_token_is_rejected() -> None:
    user = AuthenticatedUser(
        id=UUID("22222222-2222-2222-2222-222222222222"),
        name="Expired User",
        email="expired@example.com",
    )
    settings = _settings(access_token_expire_minutes=-1)
    token, _expires_at = create_access_token(
        user,
        settings,
        now=datetime.now(UTC) - timedelta(minutes=5),
    )

    with pytest.raises(Exception):
        verify_access_token(token, settings)


def test_protected_endpoint_rejects_unauthenticated_request() -> None:
    database = _database_from_env()
    database.connect()
    try:
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            response = client.get("/me")

        assert response.status_code == 401
        assert response.json() == {"error": {"message": "Invalid or expired credentials"}}
    finally:
        database.close()


def test_valid_login_and_me_return_authenticated_user() -> None:
    database = _database_from_env()
    database.connect()
    try:
        email = _unique_email("auth.valid")
        user = _create_auth_user(
            database,
            name="Auth Valid User",
            email=email,
            password="CorrectHorseBatteryStaple",
        )
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            login_response = client.post(
                "/auth/login",
                json={"email": email, "password": "CorrectHorseBatteryStaple"},
            )
            assert login_response.status_code == 200

            token = login_response.json()["access_token"]
            me_response = client.get("/me", headers={"Authorization": f"Bearer {token}"})

        assert me_response.status_code == 200
        assert me_response.json() == {
            "id": str(user["id"]),
            "name": "Auth Valid User",
            "email": email,
        }
    finally:
        database.close()


def test_invalid_credentials_fail_safely() -> None:
    database = _database_from_env()
    database.connect()
    try:
        email = _unique_email("auth.invalid")
        _create_auth_user(
            database,
            name="Auth Invalid User",
            email=email,
            password="right-password",
        )
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        with TestClient(app) as client:
            response = client.post(
                "/auth/login",
                json={"email": email, "password": "wrong-password"},
            )

        assert response.status_code == 401
        assert response.json() == {"error": {"message": "Invalid or expired credentials"}}
    finally:
        database.close()


def test_authenticated_user_reaches_audit_actor_context() -> None:
    database = _database_from_env()
    database.connect()
    try:
        email = _unique_email("auth.actor")
        user = _create_auth_user(
            database,
            name="Auth Actor User",
            email=email,
            password="actor-password",
        )
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)

        @app.get("/test/audit-actor")
        def audit_actor(
            session: DatabaseSession = Depends(get_authenticated_db_session),
        ) -> dict[str, str]:
            row = session.fetch_one("SELECT current_audit_user_id() AS user_id")
            return {"user_id": str(row["user_id"])}

        with TestClient(app) as client:
            login_response = client.post(
                "/auth/login",
                json={"email": email, "password": "actor-password"},
            )
            token = login_response.json()["access_token"]
            actor_response = client.get(
                "/test/audit-actor",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert actor_response.status_code == 200
        assert actor_response.json() == {"user_id": str(user["id"])}
    finally:
        database.close()


def _create_auth_user(database: Database, name: str, email: str, password: str) -> dict:
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


def _unique_email(prefix: str) -> str:
    return f"{prefix}.{uuid4().hex}@example.com"


def _database_from_env() -> Database:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for authentication integration tests")

    return Database(_settings(database_url=database_url))


def _settings(
    database_url: str | None = None,
    access_token_expire_minutes: int = 60,
) -> Settings:
    return Settings(
        app_name="SENSES Auth Test API",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=2,
        auth_token_secret="test-auth-secret",
        access_token_expire_minutes=access_token_expire_minutes,
    )
