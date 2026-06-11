import hmac
import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    ApiKeyCreate,
    ApiKeyResponse,
    ClickHeatmapResponse,
    EventBatchCreate,
    EventCreate,
    EventResponse,
    EventSummaryResponse,
    FormAnalyticsItemResponse,
    FormAnalyticsSummaryResponse,
    FormFieldAnalyticsResponse,
    FunnelAnalyzeRequest,
    FunnelAnalyzeResponse,
    ProjectCreate,
    ProjectResponse,
    RageClickSignalResponse,
    DeadClickSignalResponse,
    SessionDetailResponse,
    SessionResponse,
    SessionSummaryResponse,
    UXSignalsSummaryResponse,
    WhoAmIResponse,
)
from app.services.event_service import (
    create_event,
    create_events_batch,
    get_events_summary,
    list_events,
)
from app.services.funnel_service import analyze_funnel
from app.services.form_analytics_service import (
    get_form_abandonment,
    get_form_fields,
    get_forms_summary,
)
from app.services.heatmap_service import get_click_heatmap
from app.services.project_service import (
    create_project,
    create_project_api_key,
    get_project,
    list_projects,
    rotate_project_api_key,
    verify_project_api_key,
)
from app.services.session_service import (
    get_session_detail,
    get_sessions_summary,
    list_sessions,
)
from app.services.ux_signal_service import (
    detect_dead_clicks,
    detect_rage_clicks,
    get_ux_signals_summary,
)

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

MASTER_API_KEY = os.getenv("UXPULSE_MASTER_API_KEY")

app = FastAPI(
    title="UXPulse Analytics API",
    version="0.1.0",
    description="Self-hosted UX and behavior analytics platform.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

bearer_scheme = HTTPBearer(auto_error=False)


def require_master_key(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing Authorization header.")

    token = credentials.credentials.strip()

    if not MASTER_API_KEY or not hmac.compare_digest(token, MASTER_API_KEY):
        raise HTTPException(status_code=403, detail="Master API key required.")

    return token


def get_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing Authorization header.")

    token = credentials.credentials.strip()

    if MASTER_API_KEY and hmac.compare_digest(token, MASTER_API_KEY):
        return {
            "auth_type": "master",
            "project_id": None,
            "project_status": None,
            "key_type": "master",
            "key_id": None,
        }

    result = verify_project_api_key(db, token)

    if result is None:
        raise HTTPException(status_code=401, detail="Invalid API key.")

    api_key, project = result

    return {
        "auth_type": "project",
        "project_id": project.project_id,
        "project_status": project.status,
        "key_id": api_key.key_id,
        "key_type": api_key.key_type,
    }


def require_ingest_permission(auth=Depends(get_auth_context)):
    if auth["auth_type"] != "project":
        raise HTTPException(status_code=403, detail="Project ingest API key required.")

    if auth.get("key_type") != "ingest":
        raise HTTPException(status_code=403, detail="Ingest API key required.")

    return auth


def require_read_permission(auth=Depends(get_auth_context)):
    if auth["auth_type"] == "master":
        return auth

    if auth["auth_type"] == "project" and auth.get("key_type") == "read":
        return auth

    raise HTTPException(status_code=403, detail="Read API key required.")


def resolve_analytics_project_id(
    auth: dict,
    requested_project_id: str | None,
) -> str | None:
    if auth["auth_type"] == "master":
        return requested_project_id

    own_project_id = auth["project_id"]

    if requested_project_id is not None and requested_project_id != own_project_id:
        raise HTTPException(
            status_code=403,
            detail="Project API key cannot access another project.",
        )

    return own_project_id

def event_to_response(event) -> EventResponse:
    return EventResponse(
        event_id=event.event_id,
        project_id=event.project_id,
        session_id=event.session_id,
        anonymous_user_id=event.anonymous_user_id,
        event_type=event.event_type,
        page_url=event.page_url,
        page_path=event.page_path,
        element_id=event.element_id,
        element_text=event.element_text,
        element_tag=event.element_tag,
        x=event.x,
        y=event.y,
        scroll_x=event.scroll_x,
        scroll_y=event.scroll_y,
        document_width=event.document_width,
        document_height=event.document_height,
        viewport_width=event.viewport_width,
        viewport_height=event.viewport_height,
        occurred_at=event.occurred_at,
        created_at=event.created_at,
    )


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "uxpulse-analytics",
        "version": "0.1.0",
    }


@app.get("/v1/auth/whoami", response_model=WhoAmIResponse)
def whoami(auth=Depends(get_auth_context)):
    return WhoAmIResponse(
        auth_type=auth["auth_type"],
        project_id=auth["project_id"],
        project_status=auth["project_status"],
        key_type=auth["key_type"],
    )


@app.post("/v1/projects", response_model=ProjectResponse)
def create_project_endpoint(
    payload: ProjectCreate,
    _: str = Depends(require_master_key),
    db: Session = Depends(get_db),
):
    try:
        project = create_project(db, payload.name, payload.slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return ProjectResponse(
        project_id=project.project_id,
        name=project.name,
        slug=project.slug,
        status=project.status,
        created_at=project.created_at,
    )


@app.get("/v1/projects", response_model=list[ProjectResponse])
def list_projects_endpoint(
    _: str = Depends(require_master_key),
    db: Session = Depends(get_db),
):
    projects = list_projects(db)

    return [
        ProjectResponse(
            project_id=project.project_id,
            name=project.name,
            slug=project.slug,
            status=project.status,
            created_at=project.created_at,
        )
        for project in projects
    ]


@app.get("/v1/projects/{project_id}", response_model=ProjectResponse)
def get_project_endpoint(
    project_id: str,
    _: str = Depends(require_master_key),
    db: Session = Depends(get_db),
):
    project = get_project(db, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    return ProjectResponse(
        project_id=project.project_id,
        name=project.name,
        slug=project.slug,
        status=project.status,
        created_at=project.created_at,
    )


@app.post("/v1/projects/{project_id}/api-keys", response_model=ApiKeyResponse)
def create_project_api_key_endpoint(
    project_id: str,
    payload: ApiKeyCreate,
    _: str = Depends(require_master_key),
    db: Session = Depends(get_db),
):
    try:
        api_key, plain_key = create_project_api_key(
            db,
            project_id,
            payload.name,
            key_type=payload.key_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return ApiKeyResponse(
        key_id=api_key.key_id,
        project_id=api_key.project_id,
        name=api_key.name,
        key_type=api_key.key_type,
        key_prefix=api_key.key_prefix,
        key_last4=api_key.key_last4,
        status=api_key.status,
        created_at=api_key.created_at,
        api_key=plain_key,
    )


@app.post("/v1/projects/{project_id}/rotate-api-key", response_model=ApiKeyResponse)
def rotate_project_api_key_endpoint(
    project_id: str,
    key_type: str = Query(default="ingest", pattern="^(ingest|read)$"),
    _: str = Depends(require_master_key),
    db: Session = Depends(get_db),
):
    try:
        api_key, plain_key = rotate_project_api_key(
            db,
            project_id,
            key_type=key_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return ApiKeyResponse(
        key_id=api_key.key_id,
        project_id=api_key.project_id,
        name=api_key.name,
        key_type=api_key.key_type,
        key_prefix=api_key.key_prefix,
        key_last4=api_key.key_last4,
        status=api_key.status,
        created_at=api_key.created_at,
        api_key=plain_key,
    )


@app.post("/v1/events", response_model=EventResponse)
def create_event_endpoint(
    payload: EventCreate,
    auth=Depends(require_ingest_permission),
    db: Session = Depends(get_db),
):
    event = create_event(db, auth["project_id"], payload)
    return event_to_response(event)


@app.post("/v1/events/batch", response_model=list[EventResponse])
def create_events_batch_endpoint(
    payload: EventBatchCreate,
    auth=Depends(require_ingest_permission),
    db: Session = Depends(get_db),
):
    events = create_events_batch(db, auth["project_id"], payload)
    return [event_to_response(event) for event in events]


@app.get("/v1/events", response_model=list[EventResponse])
def list_events_endpoint(
    project_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    events = list_events(db, project_id=effective_project_id, limit=limit)
    return [event_to_response(event) for event in events]


@app.get("/v1/events/summary", response_model=EventSummaryResponse)
def get_events_summary_endpoint(
    project_id: str | None = None,
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    summary = get_events_summary(db, project_id=effective_project_id)
    return EventSummaryResponse(**summary)


@app.get("/v1/forms/summary", response_model=FormAnalyticsSummaryResponse)
def get_forms_summary_endpoint(
    project_id: str | None = None,
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    summary = get_forms_summary(db, project_id=effective_project_id)
    return FormAnalyticsSummaryResponse(**summary)


@app.get(
    "/v1/forms/abandonment",
    response_model=list[FormAnalyticsItemResponse],
)
def get_form_abandonment_endpoint(
    project_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    forms = get_form_abandonment(
        db,
        project_id=effective_project_id,
        limit=limit,
    )
    return [FormAnalyticsItemResponse(**form) for form in forms]


@app.get(
    "/v1/forms/fields",
    response_model=list[FormFieldAnalyticsResponse],
)
def get_form_fields_endpoint(
    project_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    fields = get_form_fields(
        db,
        project_id=effective_project_id,
        limit=limit,
    )
    return [FormFieldAnalyticsResponse(**field) for field in fields]


@app.get("/v1/sessions", response_model=list[SessionResponse])
def list_sessions_endpoint(
    project_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    sessions = list_sessions(db, project_id=effective_project_id, limit=limit)
    return [SessionResponse(**session) for session in sessions]


@app.get("/v1/sessions/summary", response_model=SessionSummaryResponse)
def get_sessions_summary_endpoint(
    project_id: str | None = None,
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    summary = get_sessions_summary(db, project_id=effective_project_id)
    return SessionSummaryResponse(**summary)


@app.get("/v1/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session_detail_endpoint(
    session_id: str,
    project_id: str | None = None,
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    session = get_session_detail(
        db,
        session_id=session_id,
        project_id=effective_project_id,
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    session_data = {
        key: value
        for key, value in session.items()
        if key != "events"
    }

    return SessionDetailResponse(
        **session_data,
        events=[event_to_response(event) for event in session["events"]],
    )


@app.post("/v1/funnels/analyze", response_model=FunnelAnalyzeResponse)
def analyze_funnel_endpoint(
    payload: FunnelAnalyzeRequest,
    project_id: str | None = None,
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    result = analyze_funnel(
        db,
        steps=payload.steps,
        project_id=effective_project_id,
    )
    return FunnelAnalyzeResponse(**result)


@app.get("/v1/ux-signals/rage-clicks", response_model=list[RageClickSignalResponse])
def list_rage_clicks_endpoint(
    project_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    signals = detect_rage_clicks(
        db,
        project_id=effective_project_id,
        limit=limit,
    )
    return [RageClickSignalResponse(**signal) for signal in signals]


@app.get("/v1/ux-signals/dead-clicks", response_model=list[DeadClickSignalResponse])
def list_dead_clicks_endpoint(
    project_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    signals = detect_dead_clicks(
        db,
        project_id=effective_project_id,
        limit=limit,
    )
    return [DeadClickSignalResponse(**signal) for signal in signals]

@app.get("/v1/ux-signals/summary", response_model=UXSignalsSummaryResponse)
def get_ux_signals_summary_endpoint(
    project_id: str | None = None,
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    summary = get_ux_signals_summary(db, project_id=effective_project_id)
    return UXSignalsSummaryResponse(**summary)


@app.get("/v1/heatmaps/clicks", response_model=ClickHeatmapResponse)
def get_click_heatmap_endpoint(
    project_id: str | None = None,
    page_path: str | None = Query(default=None, max_length=500),
    viewport_segment: Literal["mobile", "tablet", "desktop", "unknown"] | None = None,
    limit: int = Query(default=1000, ge=1, le=5000),
    auth=Depends(require_read_permission),
    db: Session = Depends(get_db),
):
    effective_project_id = resolve_analytics_project_id(auth, project_id)
    heatmap = get_click_heatmap(
        db,
        project_id=effective_project_id,
        page_path=page_path,
        viewport_segment=viewport_segment,
        limit=limit,
    )
    return ClickHeatmapResponse(**heatmap)
