import os
from urllib.parse import unquote, urlparse

from psycopg.conninfo import conninfo_to_dict
import pytest


TEST_DATABASE_NAMES = {"senses_test"}


def pytest_sessionstart(session: pytest.Session) -> None:
    test_database_url = os.getenv("TEST_DATABASE_URL")
    if test_database_url:
        os.environ["DATABASE_URL"] = test_database_url

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return

    database_name = _database_name_from_url(database_url)
    if not _is_allowed_test_database(database_name):
        raise pytest.UsageError(
            "Refusing to run database-backed tests against a non-test database. "
            "Set DATABASE_URL to a disposable test database such as 'senses_test'. "
            f"Detected database: {database_name or '<unknown>'}."
        )


def _database_name_from_url(database_url: str) -> str | None:
    normalized_url = database_url.strip().strip('"').strip("'")
    try:
        database_name = conninfo_to_dict(normalized_url).get("dbname")
        if database_name:
            return database_name
    except Exception:
        pass

    parsed = urlparse(normalized_url)
    if not parsed.path or parsed.path == "/":
        return None

    return unquote(parsed.path.rsplit("/", maxsplit=1)[-1])


def _is_allowed_test_database(database_name: str | None) -> bool:
    if not database_name:
        return False

    normalized_name = database_name.lower()
    return normalized_name in TEST_DATABASE_NAMES or normalized_name.endswith("_test")
