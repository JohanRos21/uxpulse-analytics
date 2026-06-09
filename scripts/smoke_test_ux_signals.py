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


def click(
    session_id: str,
    occurred_at: str,
    *,
    element_id: str | None = None,
    x: float | None = None,
    y: float | None = None,
    page_path: str = "/signals",
) -> dict:
    return {
        "session_id": session_id,
        "event_type": "click",
        "page_path": page_path,
        "element_id": element_id,
        "x": x,
        "y": y,
        "occurred_at": occurred_at,
    }


def main() -> None:
    master_key = require_master_key()
    project_id, ingest_key, read_key = create_project_with_keys("Signals Smoke")
    base = datetime.now(timezone.utc)

    events = [
        click("rage-element", iso_at(base, 0), element_id="pay-button"),
        click("rage-element", iso_at(base, 0.5), element_id="pay-button"),
        click("rage-element", iso_at(base, 1), element_id="pay-button"),
        click("normal-clicks", iso_at(base, 10), element_id="normal-button"),
        click("normal-clicks", iso_at(base, 13), element_id="normal-button"),
        click("normal-clicks", iso_at(base, 16), element_id="normal-button"),
        click("rage-coordinates", iso_at(base, 20), x=100, y=100),
        click("rage-coordinates", iso_at(base, 20.7), x=110, y=105),
        click("rage-coordinates", iso_at(base, 21.4), x=118, y=110),
    ]
    request_ok(
        "POST",
        "/v1/events/batch",
        token=ingest_key,
        json={"events": events},
    )

    signals = request_ok(
        "GET",
        "/v1/ux-signals/rage-clicks",
        token=read_key,
    ).json()
    assert_true(len(signals) == 2, f"Expected two rage clicks, got {len(signals)}")
    assert_true(
        {signal["session_id"] for signal in signals}
        == {"rage-element", "rage-coordinates"},
        "Wrong rage-click sessions detected",
    )
    assert_true(
        all(signal["severity"] == "low" for signal in signals),
        "Three-click signals should have low severity",
    )

    summary = request_ok(
        "GET",
        "/v1/ux-signals/summary",
        token=read_key,
    ).json()
    assert_true(summary["total_rage_clicks"] == 2, "Wrong rage-click total")
    assert_true(summary["low_severity_count"] == 2, "Wrong severity total")
    print("[OK] Element and coordinate rage-click detection")

    other_project_id, _, other_read_key = create_project_with_keys(
        "Signals Isolation"
    )
    assert_true(
        request_ok(
            "GET",
            "/v1/ux-signals/rage-clicks",
            token=other_read_key,
        ).json()
        == [],
        "UX signals leaked across projects",
    )
    expect_status(
        "GET",
        "/v1/ux-signals/rage-clicks",
        403,
        token=read_key,
        params={"project_id": other_project_id},
    )
    master_signals = request_ok(
        "GET",
        "/v1/ux-signals/rage-clicks",
        token=master_key,
        params={"project_id": project_id},
    ).json()
    assert_true(len(master_signals) == 2, "Master signal filter failed")
    print("[OK] UX signal project isolation and master access")


if __name__ == "__main__":
    run_smoke("UX signals", main)
