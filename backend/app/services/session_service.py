from collections import Counter, defaultdict
from typing import Any

from sqlalchemy.orm import Session

from app.db_models import Event


SessionData = dict[str, Any]


def event_page(event: Event) -> str | None:
    return event.page_path or event.page_url


def build_session(events: list[Event]) -> SessionData:
    first_event = events[0]
    last_event = events[-1]
    anonymous_user_id = next(
        (event.anonymous_user_id for event in events if event.anonymous_user_id),
        None,
    )
    event_types = Counter(event.event_type for event in events)
    duration_seconds = max(
        0.0,
        (last_event.occurred_at - first_event.occurred_at).total_seconds(),
    )

    return {
        "session_id": first_event.session_id,
        "project_id": first_event.project_id,
        "anonymous_user_id": anonymous_user_id,
        "total_events": len(events),
        "first_event_at": first_event.occurred_at,
        "last_event_at": last_event.occurred_at,
        "duration_seconds": round(duration_seconds, 3),
        "first_page": event_page(first_event),
        "last_page": event_page(last_event),
        "event_types": dict(event_types),
    }


def load_grouped_sessions(
    db: Session,
    project_id: str | None = None,
) -> list[tuple[SessionData, list[Event]]]:
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

    sessions = [
        (build_session(session_events), session_events)
        for session_events in grouped_events.values()
    ]
    sessions.sort(key=lambda item: item[0]["last_event_at"], reverse=True)
    return sessions


def list_sessions(
    db: Session,
    project_id: str | None = None,
    limit: int = 100,
) -> list[SessionData]:
    sessions = load_grouped_sessions(db, project_id=project_id)
    return [session for session, _ in sessions[:limit]]


def get_session_detail(
    db: Session,
    session_id: str,
    project_id: str | None = None,
) -> SessionData | None:
    sessions = load_grouped_sessions(db, project_id=project_id)

    for session, events in sessions:
        if session["session_id"] == session_id:
            return {
                **session,
                "events": events,
            }

    return None


def get_sessions_summary(
    db: Session,
    project_id: str | None = None,
) -> dict[str, object]:
    sessions = [session for session, _ in load_grouped_sessions(db, project_id=project_id)]

    if not sessions:
        return {
            "total_sessions": 0,
            "average_events_per_session": 0.0,
            "average_duration_seconds": 0.0,
            "top_entry_pages": {},
            "top_exit_pages": {},
        }

    entry_pages = Counter(session["first_page"] or "unknown" for session in sessions)
    exit_pages = Counter(session["last_page"] or "unknown" for session in sessions)
    total_events = sum(session["total_events"] for session in sessions)
    total_duration = sum(session["duration_seconds"] for session in sessions)
    total_sessions = len(sessions)

    return {
        "total_sessions": total_sessions,
        "average_events_per_session": round(total_events / total_sessions, 2),
        "average_duration_seconds": round(total_duration / total_sessions, 2),
        "top_entry_pages": dict(entry_pages.most_common(10)),
        "top_exit_pages": dict(exit_pages.most_common(10)),
    }
