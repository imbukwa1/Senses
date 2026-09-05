from fastapi.testclient import TestClient
import pytest

from app.config import Settings
from app.main import create_app


class FakeDatabase:
    def __init__(self, reachable: bool = True) -> None:
        self.reachable = reachable
        self.connected = False
        self.closed = False

    def connect(self) -> None:
        self.connected = True

    def close(self) -> None:
        self.closed = True

    def ping(self) -> bool:
        return self.reachable


def test_application_starts_and_stops() -> None:
    database = FakeDatabase()
    app = create_app(settings=_settings(), database=database)

    with TestClient(app):
        assert database.connected is True

    assert database.closed is True


def test_health_returns_running_and_database_reachable() -> None:
    app = create_app(settings=_settings(), database=FakeDatabase(reachable=True))

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "api": "running",
        "database": "reachable",
    }


def test_health_returns_degraded_when_database_unreachable() -> None:
    app = create_app(settings=_settings(), database=FakeDatabase(reachable=False))

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "api": "running",
        "database": "unreachable",
    }


def test_application_requires_auth_secret() -> None:
    with pytest.raises(RuntimeError, match="AUTH_TOKEN_SECRET"):
        create_app(settings=_settings(auth_token_secret=""))


def test_application_rejects_wildcard_cors_with_credentials() -> None:
    with pytest.raises(RuntimeError, match="CORS_ALLOWED_ORIGINS"):
        create_app(settings=_settings(cors_allowed_origins=("*",)))


def _settings(
    auth_token_secret: str = "test-secret",
    cors_allowed_origins: tuple[str, ...] = ("http://localhost:5173",),
) -> Settings:
    return Settings(
        app_name="SENSES Test API",
        database_url=None,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=1,
        auth_token_secret=auth_token_secret,
        access_token_expire_minutes=60,
        cors_allowed_origins=cors_allowed_origins,
    )
