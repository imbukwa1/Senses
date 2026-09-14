import os

from starlette.testclient import TestClient

from app.main import create_app
from test_access import _add_project_member, _create_auth_user, _create_phase, _create_project, _database_from_env, _login, _settings, _unique_email


def test_authenticated_users_share_and_manage_overlapping_calendar_events() -> None:
    database = _database_from_env()
    database.connect()
    users = []
    event_ids = []
    project_id = None
    try:
        first = _create_auth_user(database, "Calendar First", _unique_email("calendar.first"))
        second = _create_auth_user(database, "Calendar Second", _unique_email("calendar.second"))
        users.extend([first, second])
        project = _create_project(database, first["id"], "Calendar Work Plan Project")
        project_id = project["id"]
        phase = _create_phase(database, project_id, first["id"])
        _add_project_member(database, project_id, first["id"])
        with database.session() as session:
            work_plan = session.fetch_one(
                """
                INSERT INTO project_work_plan_entries
                  (project_id, phase_id, name, details, key_activities, start_date, end_date, created_by)
                VALUES (%s, %s, %s, %s, %s, DATE '2026-09-15', DATE '2026-09-16', %s)
                RETURNING id
                """,
                (project_id, phase["id"], "Field visit", "Private planning detail", "Visit sites", first["id"]),
            )
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
            work_plan_item = next(item for item in shared.json() if item["source_type"] == "work_plan" and item["source_id"] == str(work_plan["id"]))
            assert work_plan_item["source_id"] == str(work_plan["id"])
            assert work_plan_item["title"] == "Field visit"
            assert work_plan_item["project_name"] == "Calendar Work Plan Project"
            assert work_plan_item["phase_name"] == "Access Phase"
            with database.session() as session:
                session.execute("UPDATE project_work_plan_entries SET name = %s, start_date = DATE '2026-09-20', end_date = DATE '2026-09-20' WHERE id = %s", ("Updated field visit", work_plan["id"]))
            refreshed = client.get("/calendar/events", headers={"Authorization": f"Bearer {second_token}"})
            refreshed_item = next(item for item in refreshed.json() if item["source_type"] == "work_plan" and item["source_id"] == str(work_plan["id"]))
            with database.session() as session:
                session.execute("DELETE FROM project_work_plan_entries WHERE id = %s", (work_plan["id"],))
            removed_source = client.get("/calendar/events", headers={"Authorization": f"Bearer {second_token}"})
            updated = client.patch(f"/calendar/events/{event_ids[0]}", headers={"Authorization": f"Bearer {second_token}"}, json={**payload, "title": "Updated planning", "color": "green"})
            deleted = client.delete(f"/calendar/events/{event_ids[1]}", headers={"Authorization": f"Bearer {first_token}"})

        assert created.status_code == 201
        assert overlapping.status_code == 201
        assert {event["title"] for event in shared.json()} >= {"Shared planning", "Overlapping review"}
        assert refreshed_item["title"] == "Updated field visit"
        assert refreshed_item["start_at"].startswith("2026-09-20")
        assert not any(item["source_type"] == "work_plan" and item["source_id"] == str(work_plan["id"]) for item in removed_source.json())
        assert updated.status_code == 200
        assert updated.json()["title"] == "Updated planning"
        assert deleted.status_code == 204
    finally:
        database.connect()
        with database.session() as session:
            for event_id in event_ids:
                session.execute("DELETE FROM calendar_events WHERE id = %s", (event_id,))
            if project_id is not None:
                session.execute("DELETE FROM project_work_plan_entries WHERE project_id = %s", (project_id,))
                session.execute("DELETE FROM project_members WHERE project_id = %s", (project_id,))
                session.execute("DELETE FROM phases WHERE project_id = %s", (project_id,))
                session.execute("DELETE FROM projects WHERE id = %s", (project_id,))
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
