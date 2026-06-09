import math
from collections import Counter, defaultdict
from typing import Any

from sqlalchemy.orm import Session

from app.db_models import Event


RAGE_CLICK_WINDOW_SECONDS = 2.0
RAGE_CLICK_COORDINATE_TOLERANCE = 30.0
RAGE_CLICK_MINIMUM_CLICKS = 3

DEAD_CLICK_RESPONSE_WINDOW_SECONDS = 2.0
NON_RESPONSE_EVENT_TYPES = {"click", "scroll_depth"}

SignalData = dict[str, Any]


def event_page(event: Event) -> str | None:
    return event.page_path or event.page_url


def has_click_target(event: Event) -> bool:
    if event.element_id:
        return True

    return event.x is not None and event.y is not None


def clicks_match(first: Event, second: Event) -> bool:
    if event_page(first) != event_page(second):
        return False

    if first.element_id or second.element_id:
        return bool(first.element_id and first.element_id == second.element_id)

    if first.x is None or first.y is None or second.x is None or second.y is None:
        return False

    distance = math.hypot(second.x - first.x, second.y - first.y)
    return distance <= RAGE_CLICK_COORDINATE_TOLERANCE


def rage_click_severity(clicks_count: int) -> str:
    if clicks_count >= 6:
        return "high"

    if clicks_count >= 4:
        return "medium"

    return "low"


def dead_click_severity(dead_clicks_count: int) -> str:
    if dead_clicks_count >= 3:
        return "high"

    if dead_clicks_count == 2:
        return "medium"

    return "low"


def average_coordinate(events: list[Event], coordinate: str) -> float | None:
    values = [
        value
        for event in events
        if (value := getattr(event, coordinate)) is not None
    ]

    if not values:
        return None

    return round(sum(values) / len(values), 2)


def build_rage_click_signal(events: list[Event]) -> SignalData:
    first_click = events[0]
    last_click = events[-1]
    duration_ms = round(
        (last_click.occurred_at - first_click.occurred_at).total_seconds() * 1000
    )

    return {
        "signal_type": "rage_click",
        "project_id": first_click.project_id,
        "session_id": first_click.session_id,
        "page_path": event_page(first_click),
        "element_id": first_click.element_id,
        "x": average_coordinate(events, "x"),
        "y": average_coordinate(events, "y"),
        "clicks_count": len(events),
        "first_click_at": first_click.occurred_at,
        "last_click_at": last_click.occurred_at,
        "duration_ms": max(0, duration_ms),
        "severity": rage_click_severity(len(events)),
    }


def detect_session_rage_clicks(clicks: list[Event]) -> list[SignalData]:
    signals = []
    consumed_indexes: set[int] = set()

    for start_index, first_click in enumerate(clicks):
        if start_index in consumed_indexes or not has_click_target(first_click):
            continue

        matching_indexes = []

        for click_index in range(start_index, len(clicks)):
            if click_index in consumed_indexes:
                continue

            click = clicks[click_index]
            elapsed_seconds = (
                click.occurred_at - first_click.occurred_at
            ).total_seconds()

            if elapsed_seconds > RAGE_CLICK_WINDOW_SECONDS:
                break

            if clicks_match(first_click, click):
                matching_indexes.append(click_index)

        if len(matching_indexes) < RAGE_CLICK_MINIMUM_CLICKS:
            continue

        signal_clicks = [clicks[index] for index in matching_indexes]
        signals.append(build_rage_click_signal(signal_clicks))
        consumed_indexes.update(matching_indexes)

    return signals


def load_rage_click_signals(
    db: Session,
    project_id: str | None = None,
) -> list[SignalData]:
    query = db.query(Event).filter(Event.event_type == "click")

    if project_id:
        query = query.filter(Event.project_id == project_id)

    clicks = query.order_by(
        Event.project_id.asc(),
        Event.session_id.asc(),
        Event.occurred_at.asc(),
        Event.id.asc(),
    ).all()

    grouped_clicks: dict[tuple[str, str], list[Event]] = defaultdict(list)
    for click in clicks:
        grouped_clicks[(click.project_id, click.session_id)].append(click)

    signals = []
    for session_clicks in grouped_clicks.values():
        signals.extend(detect_session_rage_clicks(session_clicks))

    signals.sort(key=lambda signal: signal["last_click_at"], reverse=True)
    return signals


def detect_rage_clicks(
    db: Session,
    project_id: str | None = None,
    limit: int = 100,
) -> list[SignalData]:
    return load_rage_click_signals(db, project_id=project_id)[:limit]


def is_response_event(event: Event) -> bool:
    return event.event_type not in NON_RESPONSE_EVENT_TYPES


def click_has_response(
    click: Event,
    session_events: list[Event],
    click_index: int,
) -> bool:
    for next_event in session_events[click_index + 1 :]:
        elapsed_seconds = (next_event.occurred_at - click.occurred_at).total_seconds()

        if elapsed_seconds <= 0:
            continue

        if elapsed_seconds > DEAD_CLICK_RESPONSE_WINDOW_SECONDS:
            break

        if is_response_event(next_event):
            return True

    return False


def dead_click_group_key(signal: SignalData) -> tuple[str, str, str | None, str]:
    element_key = signal["element_id"]

    if not element_key:
        x = signal.get("x")
        y = signal.get("y")

        if x is not None and y is not None:
            element_key = f"coordinate_zone:{int(x // 30)}:{int(y // 30)}"
        else:
            element_key = "unknown"

    return (
        signal["session_id"],
        signal["page_path"],
        element_key,
        signal["project_id"],
    )


def build_dead_click_signal(click: Event) -> SignalData:
    return {
        "signal_type": "dead_click",
        "project_id": click.project_id,
        "session_id": click.session_id,
        "page_path": event_page(click),
        "element_id": click.element_id,
        "x": click.x,
        "y": click.y,
        "clicked_at": click.occurred_at,
        "severity": "low",
    }


def detect_session_dead_clicks(events: list[Event]) -> list[SignalData]:
    signals = []

    for index, event in enumerate(events):
        if event.event_type != "click":
            continue

        if not has_click_target(event):
            continue

        if click_has_response(event, events, index):
            continue

        signals.append(build_dead_click_signal(event))

    group_counts = Counter(dead_click_group_key(signal) for signal in signals)

    for signal in signals:
        signal["severity"] = dead_click_severity(
            group_counts[dead_click_group_key(signal)]
        )

    return signals


def load_dead_click_signals(
    db: Session,
    project_id: str | None = None,
) -> list[SignalData]:
    query = db.query(Event)

    if project_id:
        query = query.filter(Event.project_id == project_id)

    events = query.order_by(
        Event.project_id.asc(),
        Event.session_id.asc(),
        Event.occurred_at.asc(),
        Event.id.asc(),
    ).all()

    grouped_events: dict[tuple[str, str], list[Event]] = defaultdict(list)
    for event in events:
        grouped_events[(event.project_id, event.session_id)].append(event)

    signals = []
    for session_events in grouped_events.values():
        signals.extend(detect_session_dead_clicks(session_events))

    signals.sort(key=lambda signal: signal["clicked_at"], reverse=True)
    return signals


def detect_dead_clicks(
    db: Session,
    project_id: str | None = None,
    limit: int = 100,
) -> list[SignalData]:
    return load_dead_click_signals(db, project_id=project_id)[:limit]


def get_ux_signals_summary(
    db: Session,
    project_id: str | None = None,
) -> dict[str, object]:
    rage_signals = load_rage_click_signals(db, project_id=project_id)
    dead_signals = load_dead_click_signals(db, project_id=project_id)
    all_signals = [*rage_signals, *dead_signals]

    rage_clicks_by_page = Counter(
        signal["page_path"] or "unknown"
        for signal in rage_signals
    )
    rage_clicks_by_element = Counter(
        signal["element_id"] or "coordinate_zone"
        for signal in rage_signals
    )

    dead_clicks_by_page = Counter(
        signal["page_path"] or "unknown"
        for signal in dead_signals
    )
    dead_clicks_by_element = Counter(
        signal["element_id"] or "coordinate_zone"
        for signal in dead_signals
    )

    severity_counts = Counter(signal["severity"] for signal in all_signals)

    return {
        "total_signals": len(all_signals),
        "total_rage_clicks": len(rage_signals),
        "total_dead_clicks": len(dead_signals),
        "rage_clicks_by_page": dict(rage_clicks_by_page.most_common(10)),
        "rage_clicks_by_element": dict(rage_clicks_by_element.most_common(10)),
        "dead_clicks_by_page": dict(dead_clicks_by_page.most_common(10)),
        "dead_clicks_by_element": dict(dead_clicks_by_element.most_common(10)),
        "high_severity_count": severity_counts["high"],
        "medium_severity_count": severity_counts["medium"],
        "low_severity_count": severity_counts["low"],
    }