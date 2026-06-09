import json
import secrets
from collections import Counter

from sqlalchemy.orm import Session

from app.db_models import Event, utc_now
from app.schemas import EventBatchCreate, EventCreate


def generate_event_id() -> str:
    return f"EVT-{secrets.token_hex(8).upper()}"


def event_from_payload(project_id: str, payload: EventCreate) -> Event:
    metadata_json = None
    if payload.metadata is not None:
        metadata_json = json.dumps(payload.metadata, default=str)

    return Event(
        event_id=generate_event_id(),
        project_id=project_id,
        session_id=payload.session_id,
        anonymous_user_id=payload.anonymous_user_id,
        event_type=payload.event_type,
        page_url=payload.page_url,
        page_path=payload.page_path,
        element_id=payload.element_id,
        element_text=payload.element_text,
        x=payload.x,
        y=payload.y,
        viewport_width=payload.viewport_width,
        viewport_height=payload.viewport_height,
        user_agent=payload.user_agent,
        metadata_json=metadata_json,
        occurred_at=payload.occurred_at or utc_now(),
    )


def create_event(db: Session, project_id: str, payload: EventCreate) -> Event:
    event = event_from_payload(project_id, payload)

    db.add(event)
    db.commit()
    db.refresh(event)

    return event


def create_events_batch(
    db: Session,
    project_id: str,
    payload: EventBatchCreate,
) -> list[Event]:
    events = [event_from_payload(project_id, event_payload) for event_payload in payload.events]

    db.add_all(events)
    db.commit()

    for event in events:
        db.refresh(event)

    return events


def list_events(
    db: Session,
    project_id: str | None = None,
    limit: int = 100,
) -> list[Event]:
    query = db.query(Event)

    if project_id:
        query = query.filter(Event.project_id == project_id)

    return query.order_by(Event.occurred_at.desc(), Event.id.desc()).limit(limit).all()


def get_events_summary(
    db: Session,
    project_id: str | None = None,
) -> dict[str, object]:
    query = db.query(Event)

    if project_id:
        query = query.filter(Event.project_id == project_id)

    events = query.all()

    events_by_type = Counter(event.event_type for event in events)
    top_pages = Counter(event.page_path or event.page_url or "unknown" for event in events)

    return {
        "total_events": len(events),
        "events_by_type": dict(events_by_type),
        "top_pages": dict(top_pages.most_common(10)),
    }
