import os
from uuid import UUID

from fastapi.testclient import TestClient
import pytest

from app.config import Settings
from app.db import Database
from app.main import create_app


def test_database_connection_opens_pings_and_closes() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for the database connectivity test")

    database = Database(
        Settings(
            app_name="SENSES Test API",
            database_url=database_url,
            log_level="CRITICAL",
            db_pool_min_size=1,
            db_pool_max_size=1,
            auth_token_secret="test-secret",
            access_token_expire_minutes=60,
        )
    )

    database.connect()
    try:
        assert database.ping() is True
    finally:
        database.close()

    assert database.ping() is False


def test_health_endpoint_reports_reachable_database() -> None:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for the health database readiness test")

    settings = Settings(
        app_name="SENSES Test API",
        database_url=database_url,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=1,
        auth_token_secret="test-secret",
        access_token_expire_minutes=60,
    )
    app = create_app(settings=settings)

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "api": "running",
        "database": "reachable",
    }


def test_transaction_commits_successfully() -> None:
    database = _database_from_env()
    database.connect()
    try:
        with database.session() as session:
            session.execute("CREATE TEMP TABLE commit_check (value TEXT) ON COMMIT PRESERVE ROWS")
            session.execute("INSERT INTO commit_check (value) VALUES (%s)", ("committed",))

        with database.session() as session:
            row = session.fetch_one("SELECT value FROM commit_check")

        assert row == {"value": "committed"}
    finally:
        database.close()


def test_transaction_rolls_back_on_failure() -> None:
    database = _database_from_env()
    database.connect()
    try:
        with database.session() as session:
            session.execute("CREATE TEMP TABLE rollback_check (value TEXT) ON COMMIT PRESERVE ROWS")

        with pytest.raises(RuntimeError):
            with database.session() as session:
                session.execute("INSERT INTO rollback_check (value) VALUES (%s)", ("rolled back",))
                raise RuntimeError("force rollback")

        with database.session() as session:
            count = session.fetch_one("SELECT COUNT(*) AS count FROM rollback_check")

        assert count == {"count": 0}
    finally:
        database.close()


def test_parameterized_query_execution_and_fetch_helpers() -> None:
    database = _database_from_env()
    database.connect()
    try:
        with database.session() as session:
            session.execute("CREATE TEMP TABLE params_check (id INTEGER, value TEXT)")
            affected_rows = session.execute(
                "INSERT INTO params_check (id, value) VALUES (%s, %s), (%s, %s)",
                (1, "alpha", 2, "beta"),
            )
            one_row = session.fetch_one(
                "SELECT value FROM params_check WHERE id = %s",
                (1,),
            )
            all_rows = session.fetch_all(
                "SELECT value FROM params_check WHERE id >= %s ORDER BY id",
                (1,),
            )

        assert affected_rows == 2
        assert one_row == {"value": "alpha"}
        assert all_rows == [{"value": "alpha"}, {"value": "beta"}]
    finally:
        database.close()


def test_connection_cleanup_after_failed_transaction() -> None:
    database = _database_from_env()
    database.connect()
    try:
        with pytest.raises(RuntimeError):
            with database.session():
                raise RuntimeError("force cleanup")

        assert database.ping() is True
    finally:
        database.close()


def test_audit_actor_context_can_be_set_and_is_transaction_local() -> None:
    database = _database_from_env()
    actor_user_id = UUID("11111111-1111-1111-1111-111111111111")
    database.connect()
    try:
        with database.session(actor_user_id=actor_user_id) as session:
            row = session.fetch_one("SELECT current_audit_user_id() AS user_id")

        with database.session() as session:
            cleared_row = session.fetch_one("SELECT current_audit_user_id() AS user_id")

        assert row == {"user_id": actor_user_id}
        assert cleared_row == {"user_id": None}
    finally:
        database.close()


def test_system_operation_uses_null_audit_actor() -> None:
    database = _database_from_env()
    database.connect()
    try:
        with database.session() as session:
            row = session.fetch_one("SELECT current_audit_user_id() AS user_id")

        assert row == {"user_id": None}
    finally:
        database.close()


def _database_from_env() -> Database:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for database access layer tests")

    return Database(
        Settings(
            app_name="SENSES Test API",
            database_url=database_url,
            log_level="CRITICAL",
            db_pool_min_size=1,
            db_pool_max_size=1,
            auth_token_secret="test-secret",
            access_token_expire_minutes=60,
        )
    )
