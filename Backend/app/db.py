from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
import logging
from typing import Any
from uuid import UUID

from psycopg import Connection
from psycopg import Error as PsycopgError
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import Settings

logger = logging.getLogger(__name__)

QueryParams = Mapping[str, Any] | Sequence[Any] | None
Row = dict[str, Any]


class DatabaseError(RuntimeError):
    """Raised when database access fails inside the backend layer."""


class Database:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pool: ConnectionPool | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self._settings.database_url)

    def connect(self) -> None:
        if self._pool is not None:
            return

        if not self._settings.database_url:
            logger.warning("DATABASE_URL is not configured; database pool was not opened")
            return

        self._pool = ConnectionPool(
            conninfo=self._settings.database_url,
            min_size=self._settings.db_pool_min_size,
            max_size=self._settings.db_pool_max_size,
            open=False,
            kwargs={"autocommit": False, "row_factory": dict_row},
        )
        self._pool.open()
        self._pool.wait(timeout=5)
        logger.info("PostgreSQL connection pool opened")

    def close(self) -> None:
        if self._pool is None:
            return

        self._pool.close()
        self._pool = None
        logger.info("PostgreSQL connection pool closed")

    def ping(self) -> bool:
        if self._pool is None:
            return False

        try:
            with self.session() as session:
                row = session.fetch_one("SELECT 1 AS ok")
                return row is not None and row["ok"] == 1
        except Exception:
            logger.exception("PostgreSQL readiness check failed")
            return False

    @contextmanager
    def connection(self) -> Iterator[Connection]:
        if self._pool is None:
            raise RuntimeError("Database pool is not initialized")

        with self._pool.connection() as connection:
            yield connection

    @contextmanager
    def session(self, actor_user_id: UUID | str | None = None) -> Iterator["DatabaseSession"]:
        with self.connection() as connection:
            try:
                with connection.transaction():
                    session = DatabaseSession(connection)
                    session.set_audit_actor(actor_user_id)
                    yield session
            except PsycopgError as exc:
                logger.exception("Database operation failed")
                raise DatabaseError("Database operation failed") from exc


class DatabaseSession:
    def __init__(self, connection: Connection) -> None:
        self.connection = connection

    def execute(self, query: str, params: QueryParams = None) -> int:
        try:
            with self.connection.cursor() as cursor:
                cursor.execute(query, params)
                return cursor.rowcount
        except PsycopgError as exc:
            raise DatabaseError("Database execute failed") from exc

    def fetch_one(self, query: str, params: QueryParams = None) -> Row | None:
        try:
            with self.connection.cursor() as cursor:
                cursor.execute(query, params)
                return cursor.fetchone()
        except PsycopgError as exc:
            raise DatabaseError("Database fetch_one failed") from exc

    def fetch_all(self, query: str, params: QueryParams = None) -> list[Row]:
        try:
            with self.connection.cursor() as cursor:
                cursor.execute(query, params)
                return list(cursor.fetchall())
        except PsycopgError as exc:
            raise DatabaseError("Database fetch_all failed") from exc

    def set_audit_actor(self, actor_user_id: UUID | str | None) -> None:
        value = "" if actor_user_id is None else str(actor_user_id)
        self.execute("SELECT set_config(%s, %s, TRUE)", ("app.current_user_id", value))
