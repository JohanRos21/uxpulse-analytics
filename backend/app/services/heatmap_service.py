from collections import Counter
from collections.abc import Sequence
from statistics import median
from typing import Any

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Query, Session

from app.db_models import Event


HeatmapData = dict[str, Any]
GRID_COLUMNS = 12
GRID_ROWS = 8
DOCUMENT_GRID_ROWS = 24
VIEWPORT_SEGMENTS = ("mobile", "tablet", "desktop", "unknown")
SCROLL_DEPTH_RANGES = ("0-25", "25-50", "50-75", "75-100")


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


def normalized_ratio(coordinate: float, total_size: float) -> float:
    ratio = coordinate / total_size
    return round(min(1.0, max(0.0, ratio)), 6)


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


def event_document_coordinates(event: Event) -> tuple[float, float | None, float | None]:
    scroll_x = max(0.0, float(event.scroll_x or 0))
    scroll_y = max(0.0, float(event.scroll_y or 0))
    absolute_x = float(event.x) + scroll_x
    absolute_y = float(event.y) + scroll_y

    if event.document_width and event.document_width > 0:
        normalized_x = normalized_ratio(absolute_x, event.document_width)
    elif event.viewport_width and event.viewport_width > 0:
        normalized_x = normalized_ratio(float(event.x), event.viewport_width)
    else:
        normalized_x = None

    if event.document_height and event.document_height > 0:
        normalized_document_y = normalized_ratio(
            absolute_y,
            event.document_height,
        )
    elif event.viewport_height and event.viewport_height > 0:
        normalized_document_y = normalized_ratio(
            float(event.y),
            event.viewport_height,
        )
    else:
        normalized_document_y = None

    return absolute_y, normalized_x, normalized_document_y


def event_to_document_point(event: Event) -> HeatmapData:
    absolute_y, normalized_x, normalized_document_y = (
        event_document_coordinates(event)
    )

    return {
        "event_id": event.event_id,
        "project_id": event.project_id,
        "session_id": event.session_id,
        "x": event.x,
        "y": event.y,
        "absolute_y": absolute_y,
        "normalized_x": normalized_x,
        "normalized_document_y": normalized_document_y,
        "scroll_y": event.scroll_y,
        "document_height": event.document_height,
        "viewport_height": event.viewport_height,
        "viewport_segment": event_viewport_segment(event),
        "page_path": event.page_path,
        "event_type": event.event_type,
        "element_tag": event.element_tag,
        "element_id": event.element_id,
        "element_text": event.element_text,
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


def build_document_intensity_zones(events: Sequence[Event]) -> list[HeatmapData]:
    zone_counts: Counter[tuple[int, int]] = Counter()

    for event in events:
        _, normalized_x, normalized_document_y = event_document_coordinates(event)
        if normalized_x is None or normalized_document_y is None:
            continue

        column = min(GRID_COLUMNS - 1, int(normalized_x * GRID_COLUMNS))
        row = min(
            DOCUMENT_GRID_ROWS - 1,
            int(normalized_document_y * DOCUMENT_GRID_ROWS),
        )
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


def build_document_height_summary(events: Sequence[Event]) -> HeatmapData:
    heights = sorted(
        event.document_height
        for event in events
        if event.document_height and event.document_height > 0
    )

    if not heights:
        return {
            "count": 0,
            "minimum": None,
            "maximum": None,
            "average": None,
            "median": None,
        }

    return {
        "count": len(heights),
        "minimum": heights[0],
        "maximum": heights[-1],
        "average": round(sum(heights) / len(heights), 2),
        "median": round(float(median(heights)), 2),
    }


def scroll_depth_range(normalized_document_y: float) -> str:
    depth_percent = normalized_document_y * 100

    if depth_percent < 25:
        return "0-25"

    if depth_percent < 50:
        return "25-50"

    if depth_percent < 75:
        return "50-75"

    return "75-100"


def build_scroll_depth_summary(events: Sequence[Event]) -> list[HeatmapData]:
    counts = Counter({depth_range: 0 for depth_range in SCROLL_DEPTH_RANGES})

    for event in events:
        _, _, normalized_document_y = event_document_coordinates(event)
        if normalized_document_y is None:
            continue

        counts[scroll_depth_range(normalized_document_y)] += 1

    maximum_count = max(counts.values(), default=0)
    return [
        {
            "range": depth_range,
            "count": counts[depth_range],
            "intensity": (
                round(counts[depth_range] / maximum_count, 4)
                if maximum_count
                else 0
            ),
        }
        for depth_range in SCROLL_DEPTH_RANGES
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
        "document_points": [
            event_to_document_point(event)
            for event in events
        ],
        "document_intensity_zones": build_document_intensity_zones(
            intensity_events
        ),
        "document_height_summary": build_document_height_summary(
            intensity_events
        ),
        "scroll_depth_summary": build_scroll_depth_summary(intensity_events),
    }
