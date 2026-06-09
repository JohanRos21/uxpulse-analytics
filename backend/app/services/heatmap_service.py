from collections.abc import Sequence
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.db_models import Event


HeatmapData = dict[str, Any]


def valid_clicks_query(db: Session) -> Query:
    return db.query(Event).filter(
        Event.event_type == "click",
        Event.x.is_not(None),
        Event.y.is_not(None),
        Event.viewport_width.is_not(None),
        Event.viewport_height.is_not(None),
        Event.viewport_width > 0,
        Event.viewport_height > 0,
    )


def apply_heatmap_filters(
    query: Query,
    *,
    project_id: str | None,
    page_path: str | None,
) -> Query:
    if project_id:
        query = query.filter(Event.project_id == project_id)

    if page_path:
        query = query.filter(Event.page_path == page_path)

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


def event_to_heatmap_point(event: Event) -> HeatmapData:
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
        "x_percent": normalized_percent(event.x, event.viewport_width),
        "y_percent": normalized_percent(event.y, event.viewport_height),
        "occurred_at": event.occurred_at,
    }


def get_click_heatmap(
    db: Session,
    *,
    project_id: str | None = None,
    page_path: str | None = None,
    limit: int = 1000,
) -> HeatmapData:
    query = apply_heatmap_filters(
        valid_clicks_query(db),
        project_id=project_id,
        page_path=page_path,
    )

    page_label = func.coalesce(Event.page_path, "unknown")
    element_label = func.coalesce(Event.element_id, "coordinate_zone")

    total_clicks = query.count()
    pages = count_by(query, page_label)
    element_clicks = count_by(query, element_label)
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
    }
