from collections import Counter
from collections.abc import Sequence
from typing import Any

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Query, Session

from app.db_models import Event


HeatmapData = dict[str, Any]
GRID_COLUMNS = 12
GRID_ROWS = 8
VIEWPORT_SEGMENTS = ("mobile", "tablet", "desktop", "unknown")


def clicks_with_coordinates_query(db: Session) -> Query:
    return db.query(Event).filter(
        Event.event_type == "click",
        Event.x.is_not(None),
        Event.y.is_not(None),
    )


def viewport_segment_expression() -> Any:
    return case(
        (
            or_(
                Event.viewport_width.is_(None),
                Event.viewport_width <= 0,
                Event.viewport_height.is_(None),
                Event.viewport_height <= 0,
            ),
            "unknown",
        ),
        (Event.viewport_width < 768, "mobile"),
        (Event.viewport_width < 1024, "tablet"),
        else_="desktop",
    )


def apply_heatmap_filters(
    query: Query,
    *,
    project_id: str | None,
    page_path: str | None,
    viewport_segment: str | None,
) -> Query:
    if project_id:
        query = query.filter(Event.project_id == project_id)

    if page_path:
        if page_path == "unknown":
            query = query.filter(Event.page_path.is_(None))
        else:
            query = query.filter(Event.page_path == page_path)

    if viewport_segment:
        query = query.filter(viewport_segment_expression() == viewport_segment)

    return query


def count_by(
    query: Query,
    expression: Any,
) -> dict[str, int]:
    rows: Sequence[tuple[str, int]] = (
        query.with_entities(expression, func.count(Event.id))
        .group_by(expression)
        .order_by(func.count(Event.id).desc(), expression.asc())
        .all()
    )
    return {label: count for label, count in rows}


def normalized_percent(coordinate: float, viewport_size: int) -> float:
    percent = coordinate / viewport_size * 100
    return round(min(100.0, max(0.0, percent)), 2)


def event_viewport_segment(event: Event) -> str:
    if not event_has_valid_viewport(event):
        return "unknown"

    if event.viewport_width < 768:
        return "mobile"

    if event.viewport_width < 1024:
        return "tablet"

    return "desktop"


def event_has_valid_viewport(event: Event) -> bool:
    return bool(
        event.viewport_width
        and event.viewport_width > 0
        and event.viewport_height
        and event.viewport_height > 0
    )


def event_to_heatmap_point(event: Event) -> HeatmapData:
    has_valid_viewport = event_has_valid_viewport(event)

    return {
        "event_id": event.event_id,
        "project_id": event.project_id,
        "session_id": event.session_id,
        "page_path": event.page_path,
        "element_id": event.element_id,
        "x": event.x,
        "y": event.y,
        "viewport_width": event.viewport_width,
        "viewport_height": event.viewport_height,
        "viewport_segment": event_viewport_segment(event),
        "x_percent": (
            normalized_percent(event.x, event.viewport_width)
            if has_valid_viewport
            else None
        ),
        "y_percent": (
            normalized_percent(event.y, event.viewport_height)
            if has_valid_viewport
            else None
        ),
        "occurred_at": event.occurred_at,
    }


def build_intensity_zones(events: Sequence[Event]) -> list[HeatmapData]:
    zone_counts: Counter[tuple[int, int]] = Counter()

    for event in events:
        if not event_has_valid_viewport(event):
            continue

        x_ratio = min(1.0, max(0.0, event.x / event.viewport_width))
        y_ratio = min(1.0, max(0.0, event.y / event.viewport_height))
        column = min(GRID_COLUMNS - 1, int(x_ratio * GRID_COLUMNS))
        row = min(GRID_ROWS - 1, int(y_ratio * GRID_ROWS))
        zone_counts[(column, row)] += 1

    if not zone_counts:
        return []

    maximum_count = max(zone_counts.values())
    return [
        {
            "column": column,
            "row": row,
            "count": count,
            "intensity": round(count / maximum_count, 4),
        }
        for (column, row), count in sorted(
            zone_counts.items(),
            key=lambda item: (-item[1], item[0][1], item[0][0]),
        )
    ]


def get_click_heatmap(
    db: Session,
    *,
    project_id: str | None = None,
    page_path: str | None = None,
    viewport_segment: str | None = None,
    limit: int = 1000,
) -> HeatmapData:
    query = apply_heatmap_filters(
        clicks_with_coordinates_query(db),
        project_id=project_id,
        page_path=page_path,
        viewport_segment=viewport_segment,
    )

    page_label = func.coalesce(Event.page_path, "unknown")
    element_label = func.coalesce(Event.element_id, "coordinate_zone")
    segment_label = viewport_segment_expression()

    total_clicks = query.count()
    pages = count_by(query, page_label)
    element_clicks = count_by(query, element_label)
    viewport_segments = {
        segment: 0
        for segment in VIEWPORT_SEGMENTS
    }
    viewport_segments.update(count_by(query, segment_label))
    intensity_events = query.order_by(Event.id.asc()).all()
    events = (
        query.order_by(Event.occurred_at.desc(), Event.id.desc())
        .limit(limit)
        .all()
    )

    return {
        "total_clicks": total_clicks,
        "pages": pages,
        "element_clicks": element_clicks,
        "points": [event_to_heatmap_point(event) for event in events],
        "viewport_segments": viewport_segments,
        "intensity_zones": build_intensity_zones(intensity_events),
    }
