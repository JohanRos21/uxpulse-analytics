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


def event(
    session_id: str,
    event_type: str,
    page_path: str,
    occurred_at: str,
    **overrides,
) -> dict:
    payload = {
        "session_id": session_id,
        "event_type": event_type,
        "page_path": page_path,
        "occurred_at": occurred_at,
    }
    payload.update(overrides)
    return payload


def form_metadata(**overrides) -> dict:
    metadata = {
        "form_id": "signup-form",
        "form_name": "signup",
        "form_index": 0,
        "page_path": "/signup",
        "total_fields_count": 2,
    }
    metadata.update(overrides)
    return metadata


def main() -> None:
    master_key = require_master_key()
    project_id, ingest_key, read_key = create_project_with_keys(
        "Intelligence Smoke"
    )
    base = datetime.now(timezone.utc)
    events = []

    for click_index in range(6):
        events.append(
            event(
                "rage-checkout",
                "click",
                "/checkout",
                iso_at(base, click_index * 0.25),
                element_id="pay-button",
                x=320,
                y=240,
                viewport_width=390,
                viewport_height=844,
                document_width=390,
                document_height=1800,
                scroll_y=0,
            )
        )

    funnel_sessions = [
        ("funnel-complete", ("page_view", "click", "custom_event")),
        ("funnel-partial-1", ("page_view", "click")),
        ("funnel-partial-2", ("page_view", "click")),
        ("funnel-start-1", ("page_view",)),
        ("funnel-start-2", ("page_view",)),
    ]
    offset = 10
    for session_id, event_types in funnel_sessions:
        for step_index, event_type in enumerate(event_types):
            events.append(
                event(
                    session_id,
                    event_type,
                    "/pricing",
                    iso_at(base, offset + step_index),
                    element_id=(
                        "pricing-cta"
                        if event_type == "click"
                        else None
                    ),
                    x=600 if event_type == "click" else None,
                    y=240 if event_type == "click" else None,
                    viewport_width=1280 if event_type == "click" else None,
                    viewport_height=720 if event_type == "click" else None,
                    document_width=1280 if event_type == "click" else None,
                    document_height=1800 if event_type == "click" else None,
                    scroll_y=0 if event_type == "click" else None,
                )
            )
        offset += 5

    for form_index in range(4):
        session_id = f"signup-{form_index}"
        form_offset = 50 + form_index * 5
        events.extend(
            [
                event(
                    session_id,
                    "form_start",
                    "/signup",
                    iso_at(base, form_offset),
                    metadata=form_metadata(),
                ),
                event(
                    session_id,
                    "form_field_focus",
                    "/signup",
                    iso_at(base, form_offset + 1),
                    metadata=form_metadata(
                        field_id="company-size",
                        field_name="company_size",
                        field_type="select-one",
                        field_index=1,
                        fields_touched_count=2,
                    ),
                ),
            ]
        )

        if form_index == 0:
            events.append(
                event(
                    session_id,
                    "form_submit",
                    "/signup",
                    iso_at(base, form_offset + 2),
                    metadata=form_metadata(
                        fields_touched_count=2,
                    ),
                )
            )
        else:
            events.append(
                event(
                    session_id,
                    "form_abandon",
                    "/signup",
                    iso_at(base, form_offset + 2),
                    metadata=form_metadata(
                        fields_touched_count=2,
                        last_field_id="company-size",
                        last_field_name="company_size",
                        last_field_type="select-one",
                        last_field_index=1,
                        abandon_reason="route_change",
                    ),
                )
            )

    request_ok(
        "POST",
        "/v1/events/batch",
        token=ingest_key,
        json={"events": events},
    )

    summary = request_ok(
        "GET",
        "/v1/intelligence/summary",
        token=read_key,
    ).json()
    assert_true(
        0 <= summary["overall_health_score"] <= 100,
        "Health score must be between 0 and 100",
    )
    assert_true(summary["total_issues"] > 0, "Expected detected issues")
    assert_true(summary["generated_at"], "Expected generation timestamp")

    recommendations = request_ok(
        "GET",
        "/v1/intelligence/recommendations",
        token=read_key,
    ).json()
    issues = request_ok(
        "GET",
        "/v1/intelligence/issues",
        token=read_key,
    ).json()
    assert_true(recommendations, "Expected recommendations")
    assert_true(issues, "Expected issues")
    assert_true(
        recommendations == issues,
        "Issues and recommendations should share the ordered rule output",
    )

    issue_types = {item["type"] for item in issues}
    assert_true(
        "rage_click_issue" in issue_types,
        "Expected a rage-click insight",
    )
    assert_true(
        "dead_click_issue" in issue_types,
        "Expected a dead-click insight",
    )
    assert_true(
        "form_abandonment_issue" in issue_types,
        "Expected a form-abandonment insight",
    )
    assert_true(
        "field_friction_issue" in issue_types,
        "Expected a field-friction insight",
    )
    assert_true(
        "funnel_dropoff_issue" in issue_types,
        "Expected a funnel drop-off insight",
    )

    checkout_issues = request_ok(
        "GET",
        "/v1/intelligence/issues",
        token=read_key,
        params={"page_path": "/checkout"},
    ).json()
    assert_true(checkout_issues, "Page filter should return checkout issues")
    assert_true(
        all(item["page_path"] == "/checkout" for item in checkout_issues),
        "Page filter returned another page",
    )

    selected_severity = recommendations[0]["severity"]
    severity_recommendations = request_ok(
        "GET",
        "/v1/intelligence/recommendations",
        token=read_key,
        params={"severity": selected_severity},
    ).json()
    assert_true(
        severity_recommendations
        and all(
            item["severity"] == selected_severity
            for item in severity_recommendations
        ),
        "Severity filter failed",
    )
    print("[OK] Rule output, health score, and filters")

    for path in (
        "/v1/intelligence/summary",
        "/v1/intelligence/recommendations",
        "/v1/intelligence/issues",
    ):
        expect_status("GET", path, 403, token=ingest_key)

    other_project_id, _, other_read_key = create_project_with_keys(
        "Intelligence Isolation"
    )
    other_summary = request_ok(
        "GET",
        "/v1/intelligence/summary",
        token=other_read_key,
    ).json()
    assert_true(
        other_summary["overall_health_score"] == 100,
        "Empty project should not receive unsupported health penalties",
    )
    other_issues = request_ok(
        "GET",
        "/v1/intelligence/issues",
        token=other_read_key,
    ).json()
    assert_true(
        len(other_issues) == 1
        and other_issues[0]["type"] == "low_data_notice",
        "Low-data project should return only a low-data notice",
    )
    expect_status(
        "GET",
        "/v1/intelligence/summary",
        403,
        token=read_key,
        params={"project_id": other_project_id},
    )

    master_summary = request_ok(
        "GET",
        "/v1/intelligence/summary",
        token=master_key,
        params={"project_id": project_id},
    ).json()
    assert_true(
        master_summary["total_issues"] == summary["total_issues"],
        "Master project filter returned different intelligence",
    )
    print("[OK] Permissions, isolation, low data, and master access")


if __name__ == "__main__":
    run_smoke("UX intelligence", main)
