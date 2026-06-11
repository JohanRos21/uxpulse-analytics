import json
from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from app.db_models import Event


FORM_EVENT_TYPES = (
    "form_start",
    "form_field_focus",
    "form_field_blur",
    "form_submit",
    "form_abandon",
)

FormData = dict[str, Any]


def parse_metadata(event: Event) -> FormData:
    if not event.metadata_json:
        return {}

    try:
        metadata = json.loads(event.metadata_json)
    except (json.JSONDecodeError, TypeError):
        return {}

    return metadata if isinstance(metadata, dict) else {}


def string_value(metadata: FormData, key: str) -> str | None:
    value = metadata.get(key)
    if not isinstance(value, str):
        return None

    normalized = value.strip()
    return normalized[:500] if normalized else None


def integer_value(metadata: FormData, key: str) -> int | None:
    value = metadata.get(key)
    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        return max(0, int(value))

    return None


def number_value(metadata: FormData, key: str) -> float | None:
    value = metadata.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None

    return max(0.0, float(value))


def percentage(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0

    return round(min(100.0, numerator / denominator * 100), 2)


def form_descriptor(event: Event, metadata: FormData) -> FormData:
    form_id = string_value(metadata, "form_id")
    form_name = string_value(metadata, "form_name")
    form_index = integer_value(metadata, "form_index")
    page_path = (
        string_value(metadata, "page_path")
        or event.page_path
        or "unknown"
    )
    identity = (
        f"id:{form_id}"
        if form_id
        else f"name:{form_name}"
        if form_name
        else f"index:{form_index}"
        if form_index is not None
        else "unknown"
    )

    return {
        "key": f"{event.project_id}|{page_path}|{identity}",
        "project_id": event.project_id,
        "form_id": form_id,
        "form_name": form_name,
        "form_index": form_index,
        "page_path": page_path,
    }


def field_descriptor(
    event: Event,
    metadata: FormData,
    *,
    last_field: bool = False,
) -> FormData | None:
    prefix = "last_" if last_field else ""
    field_id = string_value(metadata, f"{prefix}field_id")
    field_name = string_value(metadata, f"{prefix}field_name")
    field_type = string_value(metadata, f"{prefix}field_type")
    field_index = integer_value(metadata, f"{prefix}field_index")

    if (
        last_field
        and field_id is None
        and field_name is None
        and field_type is None
        and field_index is None
    ):
        return None

    form = form_descriptor(event, metadata)
    identity = (
        f"id:{field_id}"
        if field_id
        else f"name:{field_name}"
        if field_name
        else f"type:{field_type or 'unknown'}:{field_index}"
    )

    return {
        **form,
        "key": f"{form['key']}|{identity}",
        "field_id": field_id,
        "field_name": field_name,
        "field_type": field_type or "unknown",
        "field_index": field_index,
    }


def field_label(metadata: FormData) -> str | None:
    field_name = string_value(metadata, "last_field_name")
    field_id = string_value(metadata, "last_field_id")
    field_type = string_value(metadata, "last_field_type")
    field_index = integer_value(metadata, "last_field_index")

    if field_name:
        return field_name

    if field_id:
        return f"#{field_id}"

    if field_type:
        return (
            f"{field_type} ({field_index})"
            if field_index is not None
            else field_type
        )

    return None


def list_form_events(
    db: Session,
    project_id: str | None = None,
) -> list[Event]:
    query = db.query(Event).filter(Event.event_type.in_(FORM_EVENT_TYPES))

    if project_id:
        query = query.filter(Event.project_id == project_id)

    return query.order_by(Event.occurred_at.asc(), Event.id.asc()).all()


def aggregate_forms(events: list[Event]) -> list[FormData]:
    forms: dict[str, FormData] = {}

    for event in events:
        metadata = parse_metadata(event)
        descriptor = form_descriptor(event, metadata)
        form = forms.setdefault(
            descriptor["key"],
            {
                **descriptor,
                "starts": 0,
                "submits": 0,
                "abandons": 0,
                "last_fields": Counter(),
                "fields_touched_total": 0,
                "fields_touched_samples": 0,
            },
        )

        if event.event_type == "form_start":
            form["starts"] += 1
        elif event.event_type == "form_submit":
            form["submits"] += 1
        elif event.event_type == "form_abandon":
            form["abandons"] += 1
            last_field = field_label(metadata)
            if last_field:
                form["last_fields"][last_field] += 1

            fields_touched = integer_value(
                metadata,
                "fields_touched_count",
            )
            if fields_touched is not None:
                form["fields_touched_total"] += fields_touched
                form["fields_touched_samples"] += 1

    return [serialize_form(form) for form in forms.values()]


def serialize_form(form: FormData) -> FormData:
    starts = form["starts"]
    submits = form["submits"]
    abandons = form["abandons"]
    sample_count = form["fields_touched_samples"]
    most_common_last_field = (
        form["last_fields"].most_common(1)[0][0]
        if form["last_fields"]
        else None
    )

    return {
        "project_id": form["project_id"],
        "form_id": form["form_id"],
        "form_name": form["form_name"],
        "form_index": form["form_index"],
        "page_path": form["page_path"],
        "starts": starts,
        "submits": submits,
        "abandons": abandons,
        "submit_rate": percentage(submits, starts),
        "abandon_rate": percentage(abandons, starts),
        "most_common_last_field": most_common_last_field,
        "average_fields_touched_before_abandon": (
            round(form["fields_touched_total"] / sample_count, 2)
            if sample_count
            else 0.0
        ),
    }


def get_forms_summary(
    db: Session,
    project_id: str | None = None,
) -> FormData:
    forms = aggregate_forms(list_form_events(db, project_id))
    total_starts = sum(form["starts"] for form in forms)
    total_submits = sum(form["submits"] for form in forms)
    total_abandons = sum(form["abandons"] for form in forms)

    return {
        "total_forms": len(forms),
        "total_form_starts": total_starts,
        "total_form_submits": total_submits,
        "total_form_abandons": total_abandons,
        "overall_submit_rate": percentage(total_submits, total_starts),
        "overall_abandon_rate": percentage(total_abandons, total_starts),
        "top_forms_by_starts": sorted(
            forms,
            key=lambda form: (
                -form["starts"],
                form["page_path"],
                form["form_id"] or form["form_name"] or "",
            ),
        )[:10],
        "top_forms_by_abandonment": sorted(
            forms,
            key=lambda form: (
                -form["abandons"],
                -form["abandon_rate"],
                form["page_path"],
            ),
        )[:10],
        "top_forms_by_submit_rate": sorted(
            (form for form in forms if form["starts"] > 0),
            key=lambda form: (
                -form["submit_rate"],
                -form["submits"],
                form["page_path"],
            ),
        )[:10],
    }


def get_form_abandonment(
    db: Session,
    project_id: str | None = None,
    limit: int = 100,
) -> list[FormData]:
    forms = aggregate_forms(list_form_events(db, project_id))
    return sorted(
        (form for form in forms if form["abandons"] > 0),
        key=lambda form: (
            -form["abandons"],
            -form["abandon_rate"],
            form["page_path"],
        ),
    )[:limit]


def get_form_fields(
    db: Session,
    project_id: str | None = None,
    limit: int = 100,
) -> list[FormData]:
    fields: dict[str, FormData] = {}

    for event in list_form_events(db, project_id):
        metadata = parse_metadata(event)

        if event.event_type in {"form_field_focus", "form_field_blur"}:
            descriptor = field_descriptor(event, metadata)
        elif event.event_type == "form_abandon":
            descriptor = field_descriptor(
                event,
                metadata,
                last_field=True,
            )
        else:
            continue

        if descriptor is None:
            continue

        field = fields.setdefault(
            descriptor["key"],
            {
                **descriptor,
                "focus_count": 0,
                "blur_count": 0,
                "abandon_count_as_last_field": 0,
                "time_on_field_total": 0.0,
                "time_on_field_samples": 0,
            },
        )

        if event.event_type == "form_field_focus":
            field["focus_count"] += 1
        elif event.event_type == "form_field_blur":
            field["blur_count"] += 1
            time_on_field = number_value(metadata, "time_on_field_ms")
            if time_on_field is not None:
                field["time_on_field_total"] += time_on_field
                field["time_on_field_samples"] += 1
        elif event.event_type == "form_abandon":
            field["abandon_count_as_last_field"] += 1

    results = [
        {
            "project_id": field["project_id"],
            "form_id": field["form_id"],
            "form_name": field["form_name"],
            "page_path": field["page_path"],
            "field_id": field["field_id"],
            "field_name": field["field_name"],
            "field_type": field["field_type"],
            "field_index": field["field_index"],
            "focus_count": field["focus_count"],
            "blur_count": field["blur_count"],
            "abandon_count_as_last_field": (
                field["abandon_count_as_last_field"]
            ),
            "average_time_on_field_ms": (
                round(
                    field["time_on_field_total"]
                    / field["time_on_field_samples"],
                    2,
                )
                if field["time_on_field_samples"]
                else 0.0
            ),
        }
        for field in fields.values()
    ]

    return sorted(
        results,
        key=lambda field: (
            -field["abandon_count_as_last_field"],
            -field["focus_count"],
            -field["average_time_on_field_ms"],
            field["page_path"],
        ),
    )[:limit]
