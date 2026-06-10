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


def click_event(
    session_id: str,
    page_path: str,
    occurred_at: str,
    *,
    x: float | None,
    y: float | None,
    viewport_width: int | None,
    viewport_height: int | None,
    element_id: str | None = None,
) -> dict:
    return {
        "session_id": session_id,
        "event_type": "click",
        "page_path": page_path,
        "element_id": element_id,
        "x": x,
        "y": y,
        "viewport_width": viewport_width,
        "viewport_height": viewport_height,
        "occurred_at": occurred_at,
    }


def main() -> None:
    master_key = require_master_key()
    project_id, ingest_key, read_key = create_project_with_keys("Heatmaps Smoke")
    base = datetime.now(timezone.utc)

    events = [
        click_event(
            "heatmap-pricing",
            "/pricing",
            iso_at(base, 0),
            x=100,
            y=200,
            viewport_width=1000,
            viewport_height=800,
            element_id="checkout-button",
        ),
        click_event(
            "heatmap-pricing",
            "/pricing",
            iso_at(base, 1),
            x=500,
            y=400,
            viewport_width=1000,
            viewport_height=800,
            element_id="checkout-button",
        ),
        click_event(
            "heatmap-pricing",
            "/pricing",
            iso_at(base, 2),
            x=900,
            y=600,
            viewport_width=1000,
            viewport_height=800,
            element_id="plan-card",
        ),
        click_event(
            "heatmap-home",
            "/home",
            iso_at(base, 3),
            x=320,
            y=200,
            viewport_width=1280,
            viewport_height=720,
            element_id="hero-button",
        ),
        click_event(
            "heatmap-home",
            "/home",
            iso_at(base, 4),
            x=640,
            y=360,
            viewport_width=1280,
            viewport_height=720,
        ),
        click_event(
            "heatmap-mobile",
            "/pricing",
            iso_at(base, 5),
            x=195,
            y=422,
            viewport_width=390,
            viewport_height=844,
            element_id="mobile-checkout",
        ),
        click_event(
            "heatmap-invalid",
            "/invalid",
            iso_at(base, 6),
            x=100,
            y=100,
            viewport_width=None,
            viewport_height=None,
        ),
        {
            "session_id": "heatmap-page-view",
            "event_type": "page_view",
            "page_path": "/pricing",
            "occurred_at": iso_at(base, 7),
        },
    ]
    request_ok(
        "POST",
        "/v1/events/batch",
        token=ingest_key,
        json={"events": events},
    )

    heatmap = request_ok(
        "GET",
        "/v1/heatmaps/clicks",
        token=read_key,
    ).json()
    assert_true(
        heatmap["total_clicks"] == 7,
        "Expected seven clicks with coordinates",
    )
    assert_true(
        heatmap["pages"] == {"/pricing": 4, "/home": 2, "/invalid": 1},
        f"Unexpected page counts: {heatmap['pages']}",
    )
    assert_true(
        heatmap["element_clicks"]["checkout-button"] == 2,
        "Element click ranking is wrong",
    )
    assert_true(len(heatmap["points"]) == 7, "Expected seven heatmap points")
    assert_true(
        heatmap["viewport_segments"]
        == {
            "mobile": 1,
            "tablet": 3,
            "desktop": 2,
            "unknown": 1,
        },
        f"Unexpected viewport segments: {heatmap['viewport_segments']}",
    )
    assert_true(
        bool(heatmap["intensity_zones"]),
        "Expected intensity zones in the response",
    )
    assert_true(
        max(zone["intensity"] for zone in heatmap["intensity_zones"]) == 1,
        "Maximum zone intensity must be 1",
    )
    assert_true(
        sum(zone["count"] for zone in heatmap["intensity_zones"]) == 6,
        "Only clicks with complete viewports should populate intensity zones",
    )

    normalized_point = next(
        point
        for point in heatmap["points"]
        if point["element_id"] == "checkout-button" and point["x"] == 500
    )
    assert_true(normalized_point["x_percent"] == 50, "Wrong normalized x")
    assert_true(normalized_point["y_percent"] == 50, "Wrong normalized y")
    unknown_point = next(
        point
        for point in heatmap["points"]
        if point["session_id"] == "heatmap-invalid"
    )
    assert_true(
        unknown_point["viewport_segment"] == "unknown",
        "Missing viewport should use the unknown segment",
    )
    assert_true(
        unknown_point["x_percent"] is None
        and unknown_point["y_percent"] is None,
        "Missing viewport should not produce normalized coordinates",
    )
    print("[OK] Read key receives valid click heatmap data")

    expect_status(
        "GET",
        "/v1/heatmaps/clicks",
        403,
        token=ingest_key,
    )
    print("[OK] Ingest key cannot read heatmap data")

    other_project_id, other_ingest_key, other_read_key = create_project_with_keys(
        "Heatmaps Isolation"
    )
    request_ok(
        "POST",
        "/v1/events",
        token=other_ingest_key,
        json=click_event(
            "other-heatmap",
            "/other",
            iso_at(base, 10),
            x=200,
            y=100,
            viewport_width=800,
            viewport_height=600,
            element_id="other-button",
        ),
    )
    other_heatmap = request_ok(
        "GET",
        "/v1/heatmaps/clicks",
        token=other_read_key,
    ).json()
    assert_true(other_heatmap["total_clicks"] == 1, "Other project scope is wrong")
    expect_status(
        "GET",
        "/v1/heatmaps/clicks",
        403,
        token=read_key,
        params={"project_id": other_project_id},
    )
    print("[OK] Read key cannot access another project")

    master_heatmap = request_ok(
        "GET",
        "/v1/heatmaps/clicks",
        token=master_key,
        params={"project_id": project_id},
    ).json()
    assert_true(master_heatmap["total_clicks"] == 7, "Master project filter failed")

    pricing_heatmap = request_ok(
        "GET",
        "/v1/heatmaps/clicks",
        token=read_key,
        params={"page_path": "/pricing"},
    ).json()
    assert_true(pricing_heatmap["total_clicks"] == 4, "Page filter count is wrong")
    assert_true(
        pricing_heatmap["pages"] == {"/pricing": 4},
        "Page filter ranking is wrong",
    )
    assert_true(
        all(point["page_path"] == "/pricing" for point in pricing_heatmap["points"]),
        "Page filter returned points from another page",
    )
    tablet_heatmap = request_ok(
        "GET",
        "/v1/heatmaps/clicks",
        token=read_key,
        params={
            "page_path": "/pricing",
            "viewport_segment": "tablet",
        },
    ).json()
    assert_true(
        tablet_heatmap["total_clicks"] == 3,
        "Viewport segment filter count is wrong",
    )
    assert_true(
        all(
            point["viewport_segment"] == "tablet"
            for point in tablet_heatmap["points"]
        ),
        "Viewport segment filter returned another segment",
    )
    print("[OK] Master, page_path, and viewport segment filters work")


if __name__ == "__main__":
    run_smoke("Click heatmaps", main)
