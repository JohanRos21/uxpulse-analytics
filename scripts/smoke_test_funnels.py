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

STEPS = [
    {"event_type": "page_view"},
    {"event_type": "click"},
    {"event_type": "custom_event"},
]


def main() -> None:
    master_key = require_master_key()
    project_id, ingest_key, read_key = create_project_with_keys("Funnels Smoke")
    base = datetime.now(timezone.utc)
    events = []

    for index, event_type in enumerate(("page_view", "click", "custom_event")):
        events.append(
            {
                "session_id": "funnel-complete",
                "event_type": event_type,
                "page_path": "/funnel",
                "occurred_at": iso_at(base, index),
            }
        )
    for index, event_type in enumerate(("page_view", "click")):
        events.append(
            {
                "session_id": "funnel-partial-two",
                "event_type": event_type,
                "page_path": "/funnel",
                "occurred_at": iso_at(base, 10 + index),
            }
        )
    events.extend(
        [
            {
                "session_id": "funnel-partial-one",
                "event_type": "page_view",
                "page_path": "/funnel",
                "occurred_at": iso_at(base, 20),
            },
            {
                "session_id": "funnel-not-qualified",
                "event_type": "scroll_depth",
                "page_path": "/other",
                "occurred_at": iso_at(base, 30),
            },
        ]
    )
    request_ok(
        "POST",
        "/v1/events/batch",
        token=ingest_key,
        json={"events": events},
    )

    result = request_ok(
        "POST",
        "/v1/funnels/analyze",
        token=read_key,
        json={"steps": STEPS},
    ).json()
    counts = [step["sessions_count"] for step in result["steps"]]
    assert_true(counts == [3, 2, 1], f"Unexpected funnel counts: {counts}")
    assert_true(
        abs(result["overall_conversion_rate"] - (100 / 3)) < 0.1,
        "Wrong overall conversion rate",
    )
    print("[OK] Ordered funnel analysis")

    other_project_id, _, other_read_key = create_project_with_keys(
        "Funnels Isolation"
    )
    other_result = request_ok(
        "POST",
        "/v1/funnels/analyze",
        token=other_read_key,
        json={"steps": STEPS},
    ).json()
    assert_true(
        all(step["sessions_count"] == 0 for step in other_result["steps"]),
        "Funnel data leaked across projects",
    )
    expect_status(
        "POST",
        "/v1/funnels/analyze",
        403,
        token=read_key,
        params={"project_id": other_project_id},
        json={"steps": STEPS},
    )
    master_result = request_ok(
        "POST",
        "/v1/funnels/analyze",
        token=master_key,
        params={"project_id": project_id},
        json={"steps": STEPS},
    ).json()
    assert_true(
        [step["sessions_count"] for step in master_result["steps"]] == counts,
        "Master funnel filter failed",
    )
    print("[OK] Funnel project isolation and master access")


if __name__ == "__main__":
    run_smoke("Funnels", main)
