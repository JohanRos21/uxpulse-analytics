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


def form_event(
    session_id: str,
    event_type: str,
    occurred_at: str,
    metadata: dict | None = None,
) -> dict:
    return {
        "session_id": session_id,
        "event_type": event_type,
        "page_path": "/checkout",
        "metadata": metadata,
        "occurred_at": occurred_at,
    }


def form_metadata(**overrides) -> dict:
    metadata = {
        "form_id": "checkout-form",
        "form_name": "checkout",
        "form_index": 0,
        "form_action_path": "/checkout/submit",
        "page_path": "/checkout",
        "total_fields_count": 2,
    }
    metadata.update(overrides)
    return metadata


def field_metadata(
    field_name: str,
    field_type: str,
    field_index: int,
    **overrides,
) -> dict:
    return form_metadata(
        field_id=f"{field_name}-field",
        field_name=field_name,
        field_type=field_type,
        field_index=field_index,
        field_required=True,
        **overrides,
    )


def main() -> None:
    master_key = require_master_key()
    project_id, ingest_key, read_key = create_project_with_keys("Forms Smoke")
    base = datetime.now(timezone.utc)

    events = [
        form_event(
            "form-success",
            "form_start",
            iso_at(base, 0),
            form_metadata(),
        ),
        form_event(
            "form-success",
            "form_field_focus",
            iso_at(base, 1),
            field_metadata("email", "email", 0, fields_touched_count=1),
        ),
        form_event(
            "form-success",
            "form_field_blur",
            iso_at(base, 2),
            field_metadata(
                "email",
                "email",
                0,
                fields_touched_count=1,
                time_on_field_ms=1000,
            ),
        ),
        form_event(
            "form-success",
            "form_field_focus",
            iso_at(base, 3),
            field_metadata(
                "company_size",
                "select-one",
                1,
                fields_touched_count=2,
            ),
        ),
        form_event(
            "form-success",
            "form_field_blur",
            iso_at(base, 4),
            field_metadata(
                "company_size",
                "select-one",
                1,
                fields_touched_count=2,
                time_on_field_ms=600,
            ),
        ),
        form_event(
            "form-success",
            "form_submit",
            iso_at(base, 5),
            form_metadata(
                fields_touched_count=2,
                last_field_name="company_size",
                last_field_type="select-one",
                last_field_index=1,
            ),
        ),
        form_event(
            "form-abandon-company",
            "form_start",
            iso_at(base, 10),
            form_metadata(),
        ),
        form_event(
            "form-abandon-company",
            "form_field_focus",
            iso_at(base, 11),
            field_metadata("email", "email", 0, fields_touched_count=1),
        ),
        form_event(
            "form-abandon-company",
            "form_field_blur",
            iso_at(base, 12),
            field_metadata(
                "email",
                "email",
                0,
                fields_touched_count=1,
                time_on_field_ms=500,
            ),
        ),
        form_event(
            "form-abandon-company",
            "form_field_focus",
            iso_at(base, 13),
            field_metadata(
                "company_size",
                "select-one",
                1,
                fields_touched_count=2,
            ),
        ),
        form_event(
            "form-abandon-company",
            "form_abandon",
            iso_at(base, 14),
            form_metadata(
                fields_touched_count=2,
                last_field_id="company_size-field",
                last_field_name="company_size",
                last_field_type="select-one",
                last_field_index=1,
                abandon_reason="route_change",
            ),
        ),
        form_event(
            "form-abandon-email",
            "form_start",
            iso_at(base, 20),
            form_metadata(),
        ),
        form_event(
            "form-abandon-email",
            "form_field_focus",
            iso_at(base, 21),
            field_metadata("email", "email", 0, fields_touched_count=1),
        ),
        form_event(
            "form-abandon-email",
            "form_field_blur",
            iso_at(base, 22),
            field_metadata(
                "email",
                "email",
                0,
                fields_touched_count=1,
                time_on_field_ms=1500,
            ),
        ),
        form_event(
            "form-abandon-email",
            "form_abandon",
            iso_at(base, 23),
            form_metadata(
                fields_touched_count=1,
                last_field_id="email-field",
                last_field_name="email",
                last_field_type="email",
                last_field_index=0,
                abandon_reason="page_unload",
            ),
        ),
        form_event(
            "form-incomplete",
            "form_start",
            iso_at(base, 30),
            None,
        ),
        form_event(
            "form-incomplete",
            "form_field_focus",
            iso_at(base, 31),
            {"field_type": "text"},
        ),
    ]
    request_ok(
        "POST",
        "/v1/events/batch",
        token=ingest_key,
        json={"events": events},
    )

    summary = request_ok(
        "GET",
        "/v1/forms/summary",
        token=read_key,
    ).json()
    assert_true(summary["total_forms"] == 2, "Expected checkout and unknown forms")
    assert_true(summary["total_form_starts"] == 4, "Wrong form start total")
    assert_true(summary["total_form_submits"] == 1, "Wrong form submit total")
    assert_true(summary["total_form_abandons"] == 2, "Wrong form abandon total")
    assert_true(summary["overall_submit_rate"] == 25, "Wrong submit rate")
    assert_true(summary["overall_abandon_rate"] == 50, "Wrong abandon rate")
    assert_true(
        summary["top_forms_by_starts"][0]["form_id"] == "checkout-form",
        "Checkout form should lead starts",
    )

    abandonment = request_ok(
        "GET",
        "/v1/forms/abandonment",
        token=read_key,
    ).json()
    assert_true(len(abandonment) == 1, "Expected one form with abandonment")
    checkout = abandonment[0]
    assert_true(checkout["starts"] == 3, "Wrong checkout form starts")
    assert_true(checkout["submits"] == 1, "Wrong checkout form submits")
    assert_true(checkout["abandons"] == 2, "Wrong checkout form abandons")
    assert_true(checkout["abandon_rate"] == 66.67, "Wrong checkout abandon rate")
    assert_true(
        checkout["average_fields_touched_before_abandon"] == 1.5,
        "Wrong average fields touched before abandonment",
    )

    fields = request_ok(
        "GET",
        "/v1/forms/fields",
        token=read_key,
    ).json()
    email = next(field for field in fields if field["field_name"] == "email")
    company_size = next(
        field
        for field in fields
        if field["field_name"] == "company_size"
    )
    assert_true(email["focus_count"] == 3, "Wrong email focus count")
    assert_true(email["blur_count"] == 3, "Wrong email blur count")
    assert_true(
        email["average_time_on_field_ms"] == 1000,
        "Wrong email average field time",
    )
    assert_true(
        email["abandon_count_as_last_field"] == 1,
        "Wrong email abandonment count",
    )
    assert_true(
        company_size["abandon_count_as_last_field"] == 1,
        "Wrong company-size abandonment count",
    )
    print("[OK] Form summary, abandonment, and field metrics")

    expect_status(
        "GET",
        "/v1/forms/summary",
        403,
        token=ingest_key,
    )

    other_project_id, _, other_read_key = create_project_with_keys(
        "Forms Isolation"
    )
    other_summary = request_ok(
        "GET",
        "/v1/forms/summary",
        token=other_read_key,
    ).json()
    assert_true(other_summary["total_forms"] == 0, "Form data leaked across projects")
    expect_status(
        "GET",
        "/v1/forms/summary",
        403,
        token=read_key,
        params={"project_id": other_project_id},
    )

    master_summary = request_ok(
        "GET",
        "/v1/forms/summary",
        token=master_key,
        params={"project_id": project_id},
    ).json()
    assert_true(
        master_summary["total_form_starts"] == 4,
        "Master project filter failed",
    )
    print("[OK] Form permissions, isolation, and master access")


if __name__ == "__main__":
    run_smoke("Form analytics", main)
