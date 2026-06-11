from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    slug: str = Field(min_length=2, max_length=160)


class ProjectResponse(BaseModel):
    project_id: str
    name: str
    slug: str
    status: str
    created_at: datetime


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    key_type: Literal["ingest", "read"] = "ingest"


class ApiKeyResponse(BaseModel):
    key_id: str
    project_id: str
    name: str
    key_type: str
    key_prefix: str
    key_last4: str
    status: str
    created_at: datetime
    api_key: str | None = None


class WhoAmIResponse(BaseModel):
    auth_type: Literal["master", "project"]
    project_id: str | None = None
    project_status: str | None = None
    key_type: Literal["master", "ingest", "read"] | None = None


class EventCreate(BaseModel):
    session_id: str = Field(min_length=3, max_length=120)
    anonymous_user_id: str | None = Field(default=None, max_length=120)

    event_type: str = Field(min_length=2, max_length=80)
    page_url: str | None = None
    page_path: str | None = Field(default=None, max_length=500)

    element_id: str | None = Field(default=None, max_length=200)
    element_text: str | None = Field(default=None, max_length=300)
    element_tag: str | None = Field(default=None, max_length=80)

    x: float | None = None
    y: float | None = None
    scroll_x: float | None = None
    scroll_y: float | None = None
    document_width: int | None = None
    document_height: int | None = None
    viewport_width: int | None = None
    viewport_height: int | None = None

    user_agent: str | None = None
    metadata: dict[str, Any] | None = None
    occurred_at: datetime | None = None


class EventBatchCreate(BaseModel):
    events: list[EventCreate] = Field(min_length=1, max_length=100)


class EventResponse(BaseModel):
    event_id: str
    project_id: str
    session_id: str
    anonymous_user_id: str | None
    event_type: str
    page_url: str | None
    page_path: str | None
    element_id: str | None
    element_text: str | None
    element_tag: str | None
    x: float | None
    y: float | None
    scroll_x: float | None
    scroll_y: float | None
    document_width: int | None
    document_height: int | None
    viewport_width: int | None
    viewport_height: int | None
    occurred_at: datetime
    created_at: datetime


class EventSummaryResponse(BaseModel):
    total_events: int
    events_by_type: dict[str, int]
    top_pages: dict[str, int]


class SessionResponse(BaseModel):
    session_id: str
    project_id: str
    anonymous_user_id: str | None
    total_events: int
    first_event_at: datetime
    last_event_at: datetime
    duration_seconds: float
    first_page: str | None
    last_page: str | None
    event_types: dict[str, int]


class SessionDetailResponse(SessionResponse):
    events: list[EventResponse]


class SessionSummaryResponse(BaseModel):
    total_sessions: int
    average_events_per_session: float
    average_duration_seconds: float
    top_entry_pages: dict[str, int]
    top_exit_pages: dict[str, int]


class FunnelStepInput(BaseModel):
    event_type: str = Field(min_length=2, max_length=80)
    page_path: str | None = Field(default=None, max_length=500)
    element_id: str | None = Field(default=None, max_length=200)


class FunnelStepResult(BaseModel):
    step_index: int
    event_type: str
    page_path: str | None
    element_id: str | None
    sessions_count: int
    conversion_from_previous: float
    conversion_from_start: float
    dropoff_from_previous: float


class FunnelAnalyzeRequest(BaseModel):
    steps: list[FunnelStepInput] = Field(min_length=1, max_length=20)


class FunnelAnalyzeResponse(BaseModel):
    total_sessions: int
    steps: list[FunnelStepResult]
    overall_conversion_rate: float
    overall_dropoff_rate: float


class RageClickSignalResponse(BaseModel):
    signal_type: Literal["rage_click"]
    project_id: str
    session_id: str
    page_path: str | None
    element_id: str | None
    x: float | None
    y: float | None
    clicks_count: int
    first_click_at: datetime
    last_click_at: datetime
    duration_ms: int
    severity: Literal["low", "medium", "high"]


class DeadClickSignalResponse(BaseModel):
    signal_type: Literal["dead_click"]
    project_id: str
    session_id: str
    page_path: str | None
    element_id: str | None
    x: float | None
    y: float | None
    clicked_at: datetime
    severity: Literal["low", "medium", "high"]


class UXSignalsSummaryResponse(BaseModel):
    total_signals: int
    total_rage_clicks: int
    total_dead_clicks: int
    rage_clicks_by_page: dict[str, int]
    rage_clicks_by_element: dict[str, int]
    dead_clicks_by_page: dict[str, int]
    dead_clicks_by_element: dict[str, int]
    high_severity_count: int
    medium_severity_count: int
    low_severity_count: int


class ClickHeatmapPointResponse(BaseModel):
    event_id: str
    project_id: str
    session_id: str
    page_path: str | None
    element_id: str | None
    x: float
    y: float
    viewport_width: int | None
    viewport_height: int | None
    viewport_segment: Literal["mobile", "tablet", "desktop", "unknown"]
    x_percent: float | None
    y_percent: float | None
    occurred_at: datetime


class ClickHeatmapIntensityZoneResponse(BaseModel):
    column: int
    row: int
    count: int
    intensity: float = Field(ge=0, le=1)


class ClickHeatmapDocumentPointResponse(BaseModel):
    event_id: str
    project_id: str
    session_id: str
    x: float
    y: float
    absolute_y: float
    normalized_x: float | None
    normalized_document_y: float | None
    scroll_y: float | None
    document_height: int | None
    viewport_height: int | None
    viewport_segment: Literal["mobile", "tablet", "desktop", "unknown"]
    page_path: str | None
    event_type: str
    element_tag: str | None
    element_id: str | None
    element_text: str | None


class ClickHeatmapDocumentHeightSummaryResponse(BaseModel):
    count: int
    minimum: int | None
    maximum: int | None
    average: float | None
    median: float | None


class ClickHeatmapScrollDepthBucketResponse(BaseModel):
    range: Literal["0-25", "25-50", "50-75", "75-100"]
    count: int
    intensity: float = Field(ge=0, le=1)


class ClickHeatmapResponse(BaseModel):
    total_clicks: int
    pages: dict[str, int]
    element_clicks: dict[str, int]
    points: list[ClickHeatmapPointResponse]
    viewport_segments: dict[str, int]
    intensity_zones: list[ClickHeatmapIntensityZoneResponse]
    document_points: list[ClickHeatmapDocumentPointResponse]
    document_intensity_zones: list[ClickHeatmapIntensityZoneResponse]
    document_height_summary: ClickHeatmapDocumentHeightSummaryResponse
    scroll_depth_summary: list[ClickHeatmapScrollDepthBucketResponse]


class FormAnalyticsItemResponse(BaseModel):
    project_id: str
    form_id: str | None
    form_name: str | None
    form_index: int | None
    page_path: str
    starts: int
    submits: int
    abandons: int
    submit_rate: float = Field(ge=0, le=100)
    abandon_rate: float = Field(ge=0, le=100)
    most_common_last_field: str | None
    average_fields_touched_before_abandon: float = Field(ge=0)


class FormAnalyticsSummaryResponse(BaseModel):
    total_forms: int
    total_form_starts: int
    total_form_submits: int
    total_form_abandons: int
    overall_submit_rate: float = Field(ge=0, le=100)
    overall_abandon_rate: float = Field(ge=0, le=100)
    top_forms_by_starts: list[FormAnalyticsItemResponse]
    top_forms_by_abandonment: list[FormAnalyticsItemResponse]
    top_forms_by_submit_rate: list[FormAnalyticsItemResponse]


class FormFieldAnalyticsResponse(BaseModel):
    project_id: str
    form_id: str | None
    form_name: str | None
    page_path: str
    field_id: str | None
    field_name: str | None
    field_type: str
    field_index: int | None
    focus_count: int
    blur_count: int
    abandon_count_as_last_field: int
    average_time_on_field_ms: float = Field(ge=0)


class UXIntelligenceInsightResponse(BaseModel):
    id: str
    type: str
    severity: Literal["low", "medium", "high"]
    title: str
    description: str
    recommendation: str
    page_path: str | None
    element: str | None
    metric: str
    value: float
    evidence: list[str]
    confidence: float = Field(ge=0, le=1)


class UXIntelligenceSummaryResponse(BaseModel):
    total_issues: int
    high_severity_count: int
    medium_severity_count: int
    low_severity_count: int
    top_issue_type: str | None
    top_problem_page: str | None
    overall_health_score: int = Field(ge=0, le=100)
    generated_at: datetime
    short_summary: str
