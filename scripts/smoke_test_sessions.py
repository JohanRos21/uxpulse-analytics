from datetime import datetime, timezone

from smoke_helpers import (
    assert_true,
    create_project_with_keys,
    expect_status,
    iso_at,
    request_ok,
    require_master_key,
    run_smoke,
)


def main() -> None:
    master_key = require_master_key()
    project_id, ingest_key, read_key = create_project_with_keys("Sessions Smoke")
    base = datetime.now(timezone.utc)
    session_one = "sessions-smoke-one"
    session_two = "sessions-smoke-two"

    request_ok(
        "POST",
        "/v1/events/batch",
        token=ingest_key,
        json={
            "events": [
                {
                    "session_id": session_one,
                    "anonymous_user_id": "user-one",
                    "event_type": "page_view",
                    "page_path": "/entry",
                    "occurred_at": iso_at(base, 0),
                },
                {
                    "session_id": session_one,
                    "anonymous_user_id": "user-one",
                    "event_type": "click",
                    "page_path": "/entry",
                    "occurred_at": iso_at(base, 5),
                },
                {
                    "session_id": session_one,
                    "anonymous_user_id": "user-one",
                    "event_type": "page_view",
                    "page_path": "/exit",
                    "occurred_at": iso_at(base, 12),
                },
                {
                    "session_id": session_two,
                    "anonymous_user_id": "user-two",
                    "event_type": "page_view",
                    "page_path": "/single",
                    "occurred_at": iso_at(base, 20),
                },
            ]
        },
    )

    sessions = request_ok("GET", "/v1/sessions", token=read_key).json()
    assert_true(len(sessions) == 2, "Expected two sessions")
    first = next(item for item in sessions if item["session_id"] == session_one)
    assert_true(first["total_events"] == 3, "Wrong session event count")
    assert_true(first["duration_seconds"] == 12, "Wrong session duration")

    detail = request_ok(
        "GET",
        f"/v1/sessions/{session_one}",
        token=read_key,
    ).json()
    assert_true(len(detail["events"]) == 3, "Wrong session detail size")
    assert_true(
        detail["events"][0]["event_type"] == "page_view",
        "Session detail order is wrong",
    )

    summary = request_ok("GET", "/v1/sessions/summary", token=read_key).json()
    assert_true(summary["total_sessions"] == 2, "Wrong session total")
    assert_true(
        summary["average_events_per_session"] == 2,
        "Wrong average events per session",
    )
    print("[OK] Session list, detail, and summary")

    other_project_id, _, other_read_key = create_project_with_keys(
        "Sessions Isolation"
    )
    assert_true(
        request_ok("GET", "/v1/sessions", token=other_read_key).json() == [],
        "Session data leaked across projects",
    )
    expect_status(
        "GET",
        "/v1/sessions",
        403,
        token=read_key,
        params={"project_id": other_project_id},
    )
    master_sessions = request_ok(
        "GET",
        "/v1/sessions",
        token=master_key,
        params={"project_id": project_id},
    ).json()
    assert_true(len(master_sessions) == 2, "Master session filter failed")
    print("[OK] Session project isolation and master access")


if __name__ == "__main__":
    run_smoke("Sessions", main)
