import os

from starlette.testclient import TestClient

from app.main import create_app
from test_access import _create_auth_user, _database_from_env, _login, _settings, _unique_email


def test_authenticated_users_share_and_manage_overlapping_calendar_events() -> None:
    database = _database_from_env()
    database.connect()
    users = []
    event_ids = []
    try:
        first = _create_auth_user(database, "Calendar First", _unique_email("calendar.first"))
        second = _create_auth_user(database, "Calendar Second", _unique_email("calendar.second"))
        users.extend([first, second])
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)
        with TestClient(app) as client:
            first_token = _login(client, first["email"])
            second_token = _login(client, second["email"])
            payload = {
                "title": "Shared planning",
                "description": "Same time is allowed",
                "start_at": "2026-09-14T09:00:00Z",
                "end_at": "2026-09-14T10:00:00Z",
                "all_day": False,
                "color": "teal",
            }
            created = client.post("/calendar/events", headers={"Authorization": f"Bearer {first_token}"}, json=payload)
            event_ids.append(created.json()["id"])
            overlapping = client.post("/calendar/events", headers={"Authorization": f"Bearer {second_token}"}, json={**payload, "title": "Overlapping review", "color": "amber"})
            event_ids.append(overlapping.json()["id"])
            shared = client.get("/calendar/events", headers={"Authorization": f"Bearer {second_token}"})
            updated = client.patch(f"/calendar/events/{event_ids[0]}", headers={"Authorization": f"Bearer {second_token}"}, json={**payload, "title": "Updated planning", "color": "green"})
            deleted = client.delete(f"/calendar/events/{event_ids[1]}", headers={"Authorization": f"Bearer {first_token}"})

        assert created.status_code == 201
        assert overlapping.status_code == 201
        assert {event["title"] for event in shared.json()} >= {"Shared planning", "Overlapping review"}
        assert updated.status_code == 200
        assert updated.json()["title"] == "Updated planning"
        assert deleted.status_code == 204
    finally:
        database.connect()
        with database.session() as session:
            for event_id in event_ids:
                session.execute("DELETE FROM calendar_events WHERE id = %s", (event_id,))
            for user in users:
                session.execute("DELETE FROM user_credentials WHERE user_id = %s", (user["id"],))
                session.execute("DELETE FROM users WHERE id = %s", (user["id"],))
        database.close()


def test_calendar_requires_authentication() -> None:
    database = _database_from_env()
    database.connect()
    try:
        app = create_app(settings=_settings(database_url=os.getenv("DATABASE_URL")), database=database)
        with TestClient(app) as client:
            response = client.get("/calendar/events")
        assert response.status_code == 401
    finally:
        database.close()
