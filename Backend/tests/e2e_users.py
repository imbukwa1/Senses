import json
import os
import sys
from uuid import uuid4

import psycopg

from app.auth import hash_password


def database_url() -> str:
    value = os.getenv("TEST_DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("TEST_DATABASE_URL is required")
    return value


def assert_test_database(connection: psycopg.Connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_database()")
        name = cursor.fetchone()[0]
    if name != "senses_test" and not name.endswith("_test"):
        raise RuntimeError(f"Refusing E2E fixture operation on database '{name}'")


def provision() -> None:
    password = os.getenv("E2E_PASSWORD", "").strip()
    if not password:
        raise RuntimeError("E2E_PASSWORD is required")
    created: list[str] = []
    with psycopg.connect(database_url()) as connection:
        assert_test_database(connection)
        with connection.cursor() as cursor:
            for number in range(1, 17):
                email = f"e2e.user{number:02d}@example.com"
                cursor.execute("SELECT id FROM users WHERE lower(email) = lower(%s)", (email,))
                row = cursor.fetchone()
                if row:
                    continue
                user_id = uuid4()
                cursor.execute("INSERT INTO users (id, name, email) VALUES (%s, %s, %s)", (user_id, f"E2E User {number:02d}", email))
                cursor.execute("INSERT INTO user_credentials (user_id, password_hash) VALUES (%s, %s)", (user_id, hash_password(password)))
                created.append(str(user_id))
        connection.commit()
    print(json.dumps({"created_user_ids": created}))


def cleanup() -> None:
    ids = json.loads(sys.stdin.read()).get("created_user_ids", [])
    with psycopg.connect(database_url()) as connection:
        assert_test_database(connection)
        with connection.cursor() as cursor:
            for user_id in ids:
                cursor.execute("DELETE FROM user_credentials WHERE user_id = %s", (user_id,))
                cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        connection.commit()


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"provision", "cleanup"}:
        raise SystemExit("usage: e2e_users.py provision|cleanup")
    provision() if sys.argv[1] == "provision" else cleanup()
