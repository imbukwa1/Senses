from fastapi.testclient import TestClient

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


def _settings() -> Settings:
    return Settings(
        app_name="SENSES Test API",
        database_url=None,
        log_level="CRITICAL",
        db_pool_min_size=1,
        db_pool_max_size=1,
    )
