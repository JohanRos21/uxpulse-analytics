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
    project_id, ingest_key, read_key = create_project_with_keys("Events Smoke")
    base = datetime.now(timezone.utc)

    event = request_ok(
        "POST",
        "/v1/events",
        token=ingest_key,
        json={
            "session_id": "event-smoke-session",
            "anonymous_user_id": "event-smoke-user",
            "event_type": "page_view",
            "page_url": "https://example.test/smoke",
            "page_path": "/smoke",
            "occurred_at": iso_at(base, 0),
            "metadata": {"source": "smoke"},
        },
    ).json()
    assert_true(event["project_id"] == project_id, "Event project mismatch")
    assert_true(bool(event.get("occurred_at")), "occurred_at was not returned")
    print("[OK] Single event ingestion")

    batch = request_ok(
        "POST",
        "/v1/events/batch",
        token=ingest_key,
        json={
            "events": [
                {
                    "session_id": "event-smoke-session",
                    "event_type": "click",
                    "page_path": "/smoke",
                    "element_id": "primary-button",
                    "occurred_at": iso_at(base, 1),
                },
                {
                    "session_id": "event-smoke-session",
                    "event_type": "custom_event",
                    "page_path": "/complete",
                    "occurred_at": iso_at(base, 2),
                },
            ]
        },
    ).json()
    batch_events = batch if isinstance(batch, list) else batch.get("events", [])
    assert_true(len(batch_events) == 2, "Batch did not create two events")
    print("[OK] Batch event ingestion")

    events = request_ok("GET", "/v1/events", token=read_key).json()
    assert_true(len(events) == 3, "Read key did not return project events")
    assert_true(
        events[0]["occurred_at"] >= events[-1]["occurred_at"],
        "Events are not ordered by occurred_at",
    )

    summary = request_ok("GET", "/v1/events/summary", token=read_key).json()
    assert_true(summary["total_events"] == 3, "Unexpected event total")
    print("[OK] Project analytics read")

    expect_status(
        "POST",
        "/v1/events",
        403,
        token=read_key,
        json={"session_id": "forbidden", "event_type": "click"},
    )
    expect_status("GET", "/v1/events", 403, token=ingest_key)
    expect_status(
        "POST",
        "/v1/events",
        403,
        token=master_key,
        json={"session_id": "forbidden", "event_type": "click"},
    )
    print("[OK] Read/write permissions are separated")

    other_project_id, _, other_read_key = create_project_with_keys(
        "Events Isolation"
    )
    other_events = request_ok("GET", "/v1/events", token=other_read_key).json()
    assert_true(other_events == [], "Project read key leaked another project")
    expect_status(
        "GET",
        "/v1/events",
        403,
        token=read_key,
        params={"project_id": other_project_id},
    )

    all_events = request_ok(
        "GET",
        "/v1/events",
        token=master_key,
        params={"project_id": project_id},
    ).json()
    assert_true(len(all_events) == 3, "Master project filter failed")
    print("[OK] Project isolation and master analytics")


if __name__ == "__main__":
    run_smoke("Events and key scopes", main)
