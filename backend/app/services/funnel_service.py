from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from app.db_models import Event
from app.schemas import FunnelStepInput


def percentage(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0

    return round((numerator / denominator) * 100, 2)


def event_matches_step(event: Event, step: FunnelStepInput) -> bool:
    if event.event_type != step.event_type:
        return False

    if step.page_path is not None and event.page_path != step.page_path:
        return False

    if step.element_id is not None and event.element_id != step.element_id:
        return False

    return True


def session_step_count(events: list[Event], steps: list[FunnelStepInput]) -> int:
    next_event_index = 0
    completed_steps = 0

    for step in steps:
        matched = False

        for event_index in range(next_event_index, len(events)):
            if event_matches_step(events[event_index], step):
                completed_steps += 1
                next_event_index = event_index + 1
                matched = True
                break

        if not matched:
            break

    return completed_steps


def analyze_funnel(
    db: Session,
    steps: list[FunnelStepInput],
    project_id: str | None = None,
) -> dict[str, Any]:
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

    step_counts = [0] * len(steps)

    for session_events in grouped_events.values():
        completed_steps = session_step_count(session_events, steps)

        for step_index in range(completed_steps):
            step_counts[step_index] += 1

    start_count = step_counts[0] if step_counts else 0
    step_results = []

    for step_index, step in enumerate(steps):
        sessions_count = step_counts[step_index]
        previous_count = step_counts[step_index - 1] if step_index > 0 else start_count
        conversion_from_previous = (
            100.0 if step_index == 0 and start_count > 0
            else percentage(sessions_count, previous_count)
        )

        step_results.append(
            {
                "step_index": step_index + 1,
                "event_type": step.event_type,
                "page_path": step.page_path,
                "element_id": step.element_id,
                "sessions_count": sessions_count,
                "conversion_from_previous": conversion_from_previous,
                "conversion_from_start": percentage(sessions_count, start_count),
                "dropoff_from_previous": (
                    0.0 if step_index == 0
                    else round(100.0 - conversion_from_previous, 2)
                ),
            }
        )

    final_count = step_counts[-1] if step_counts else 0
    overall_conversion_rate = percentage(final_count, start_count)

    return {
        "total_sessions": len(grouped_events),
        "steps": step_results,
        "overall_conversion_rate": overall_conversion_rate,
        "overall_dropoff_rate": (
            round(100.0 - overall_conversion_rate, 2)
            if start_count > 0
            else 0.0
        ),
    }
