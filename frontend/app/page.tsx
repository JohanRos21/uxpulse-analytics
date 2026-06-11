"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = "http://127.0.0.1:8002";
const TOKEN_STORAGE_KEY = "uxpulse_dashboard_token";

type HealthState = "checking" | "online" | "offline";

type EventsSummary = {
  total_events: number;
  events_by_type: Record<string, number>;
  top_pages: Record<string, number>;
};

type SessionsSummary = {
  total_sessions: number;
  average_events_per_session: number;
  average_duration_seconds: number;
  top_entry_pages: Record<string, number>;
  top_exit_pages: Record<string, number>;
};

type AnalyticsSession = {
  session_id: string;
  project_id: string;
  anonymous_user_id: string | null;
  total_events: number;
  first_event_at: string;
  last_event_at: string;
  duration_seconds: number;
  first_page: string | null;
  last_page: string | null;
  event_types: Record<string, number>;
};

type AnalyticsEvent = {
  event_id: string;
  project_id: string;
  session_id: string;
  anonymous_user_id: string | null;
  event_type: string;
  page_url: string | null;
  page_path: string | null;
  element_id: string | null;
  element_text: string | null;
  x: number | null;
  y: number | null;
  viewport_width: number | null;
  viewport_height: number | null;
  created_at: string;
};

type FunnelStepInput = {
  event_type: string;
  page_path?: string;
  element_id?: string;
};

type FunnelStepResult = {
  step_index: number;
  event_type: string;
  page_path: string | null;
  element_id: string | null;
  sessions_count: number;
  conversion_from_previous: number;
  conversion_from_start: number;
  dropoff_from_previous: number;
};

type FunnelAnalyzeResponse = {
  total_sessions: number;
  steps: FunnelStepResult[];
  overall_conversion_rate: number;
  overall_dropoff_rate: number;
};

type RageClickSignal = {
  signal_type: "rage_click";
  project_id: string;
  session_id: string;
  page_path: string | null;
  element_id: string | null;
  x: number | null;
  y: number | null;
  clicks_count: number;
  first_click_at: string;
  last_click_at: string;
  duration_ms: number;
  severity: "low" | "medium" | "high";
};

type DeadClickSignal = {
  signal_type: "dead_click";
  project_id: string;
  session_id: string;
  page_path: string | null;
  element_id: string | null;
  x: number | null;
  y: number | null;
  clicked_at: string;
  severity: "low" | "medium" | "high";
};

type UXSignalsSummary = {
  total_signals: number;
  total_rage_clicks: number;
  total_dead_clicks: number;
  rage_clicks_by_page: Record<string, number>;
  rage_clicks_by_element: Record<string, number>;
  dead_clicks_by_page: Record<string, number>;
  dead_clicks_by_element: Record<string, number>;
  high_severity_count: number;
  medium_severity_count: number;
  low_severity_count: number;
};

type ViewportSegment = "mobile" | "tablet" | "desktop" | "unknown";
type HeatmapSegmentFilter = "all" | ViewportSegment;
type HeatmapMode = "viewport" | "full_page";

type ClickHeatmapPoint = {
  event_id: string;
  project_id: string;
  session_id: string;
  page_path: string | null;
  element_id: string | null;
  x: number;
  y: number;
  viewport_width: number | null;
  viewport_height: number | null;
  viewport_segment: ViewportSegment;
  x_percent: number | null;
  y_percent: number | null;
  occurred_at: string;
};

type ClickHeatmapIntensityZone = {
  column: number;
  row: number;
  count: number;
  intensity: number;
};

type ClickHeatmapDocumentPoint = {
  event_id: string;
  project_id: string;
  session_id: string;
  x: number;
  y: number;
  absolute_y: number;
  normalized_x: number | null;
  normalized_document_y: number | null;
  scroll_y: number | null;
  document_height: number | null;
  viewport_height: number | null;
  viewport_segment: ViewportSegment;
  page_path: string | null;
  event_type: string;
  element_tag: string | null;
  element_id: string | null;
  element_text: string | null;
};

type ClickHeatmapDocumentHeightSummary = {
  count: number;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
  median: number | null;
};

type ClickHeatmapScrollDepthBucket = {
  range: "0-25" | "25-50" | "50-75" | "75-100";
  count: number;
  intensity: number;
};

type ClickHeatmapResponse = {
  total_clicks: number;
  pages: Record<string, number>;
  element_clicks: Record<string, number>;
  points: ClickHeatmapPoint[];
  viewport_segments: Record<ViewportSegment, number>;
  intensity_zones: ClickHeatmapIntensityZone[];
  document_points: ClickHeatmapDocumentPoint[];
  document_intensity_zones: ClickHeatmapIntensityZone[];
  document_height_summary: ClickHeatmapDocumentHeightSummary;
  scroll_depth_summary: ClickHeatmapScrollDepthBucket[];
};

type FormAnalyticsItem = {
  project_id: string;
  form_id: string | null;
  form_name: string | null;
  form_index: number | null;
  page_path: string;
  starts: number;
  submits: number;
  abandons: number;
  submit_rate: number;
  abandon_rate: number;
  most_common_last_field: string | null;
  average_fields_touched_before_abandon: number;
};

type FormAnalyticsSummary = {
  total_forms: number;
  total_form_starts: number;
  total_form_submits: number;
  total_form_abandons: number;
  overall_submit_rate: number;
  overall_abandon_rate: number;
  top_forms_by_starts: FormAnalyticsItem[];
  top_forms_by_abandonment: FormAnalyticsItem[];
  top_forms_by_submit_rate: FormAnalyticsItem[];
};

type FormFieldAnalytics = {
  project_id: string;
  form_id: string | null;
  form_name: string | null;
  page_path: string;
  field_id: string | null;
  field_name: string | null;
  field_type: string;
  field_index: number | null;
  focus_count: number;
  blur_count: number;
  abandon_count_as_last_field: number;
  average_time_on_field_ms: number;
};

type ApiError = {
  status: number;
  message: string;
};

type AuthContext = {
  auth_type: "master" | "project";
  project_id: string | null;
  project_status: string | null;
  key_type: "master" | "ingest" | "read" | null;
};

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  accent: "sky" | "emerald" | "amber" | "violet";
};

const emptySummary: EventsSummary = {
  total_events: 0,
  events_by_type: {},
  top_pages: {},
};

const emptySessionsSummary: SessionsSummary = {
  total_sessions: 0,
  average_events_per_session: 0,
  average_duration_seconds: 0,
  top_entry_pages: {},
  top_exit_pages: {},
};

const emptyUXSignalsSummary: UXSignalsSummary = {
  total_signals: 0,
  total_rage_clicks: 0,
  total_dead_clicks: 0,
  rage_clicks_by_page: {},
  rage_clicks_by_element: {},
  dead_clicks_by_page: {},
  dead_clicks_by_element: {},
  high_severity_count: 0,
  medium_severity_count: 0,
  low_severity_count: 0,
};

const emptyFormAnalyticsSummary: FormAnalyticsSummary = {
  total_forms: 0,
  total_form_starts: 0,
  total_form_submits: 0,
  total_form_abandons: 0,
  overall_submit_rate: 0,
  overall_abandon_rate: 0,
  top_forms_by_starts: [],
  top_forms_by_abandonment: [],
  top_forms_by_submit_rate: [],
};

const emptyClickHeatmap: ClickHeatmapResponse = {
  total_clicks: 0,
  pages: {},
  element_clicks: {},
  points: [],
  viewport_segments: {
    mobile: 0,
    tablet: 0,
    desktop: 0,
    unknown: 0,
  },
  intensity_zones: [],
  document_points: [],
  document_intensity_zones: [],
  document_height_summary: {
    count: 0,
    minimum: null,
    maximum: null,
    average: null,
    median: null,
  },
  scroll_depth_summary: [
    { range: "0-25", count: 0, intensity: 0 },
    { range: "25-50", count: 0, intensity: 0 },
    { range: "50-75", count: 0, intensity: 0 },
    { range: "75-100", count: 0, intensity: 0 },
  ],
};

const defaultFunnelSteps: FunnelStepInput[] = [
  { event_type: "page_view" },
  { event_type: "click" },
  { event_type: "custom_event" },
];

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function sortCounts(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort(([, first], [, second]) => second - first);
}

function displayPage(value: string | null | undefined): string {
  if (!value || value.toLowerCase() === "unknown") {
    return "Página desconocida";
  }

  return value;
}

function displayForm(form: Pick<FormAnalyticsItem, "form_id" | "form_name" | "form_index">): string {
  if (form.form_id) {
    return `#${form.form_id}`;
  }

  if (form.form_name) {
    return form.form_name;
  }

  return form.form_index !== null
    ? `Formulario ${form.form_index + 1}`
    : "Formulario desconocido";
}

function displayFormField(
  field: Pick<
    FormFieldAnalytics,
    "field_id" | "field_name" | "field_type" | "field_index"
  >,
): string {
  if (field.field_id) {
    return `#${field.field_id}`;
  }

  if (field.field_name) {
    return field.field_name;
  }

  return field.field_index !== null
    ? `${field.field_type} (${field.field_index + 1})`
    : field.field_type;
}

function formatMilliseconds(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function displaySignalElement(signal: RageClickSignal): string {
  if (signal.element_id) {
    return `#${signal.element_id}`;
  }

  if (signal.x !== null && signal.y !== null) {
    return `Zona de coordenadas (${Math.round(signal.x)}, ${Math.round(signal.y)})`;
  }

  return "Zona de coordenadas";
}

function displayDeadClickElement(signal: DeadClickSignal): string {
  if (signal.element_id) {
    return `#${signal.element_id}`;
  }

  if (signal.x !== null && signal.y !== null) {
    return `Zona de coordenadas (${Math.round(signal.x)}, ${Math.round(signal.y)})`;
  }

  return "Zona de coordenadas";
}

function displayElementRanking(value: string): string {
  return value === "coordinate_zone" ? "Zona de coordenadas" : `#${value}`;
}

function displayViewportSegment(segment: ViewportSegment): string {
  return {
    mobile: "Móvil",
    tablet: "Tablet",
    desktop: "Escritorio",
    unknown: "Desconocido",
  }[segment];
}

function displaySeverity(
  severity: RageClickSignal["severity"] | DeadClickSignal["severity"],
): string {
  return {
    low: "Baja",
    medium: "Media",
    high: "Alta",
  }[severity];
}

function severityClasses(
  severity: RageClickSignal["severity"] | DeadClickSignal["severity"],
): string {
  return {
    low: "bg-amber-50 text-amber-700",
    medium: "bg-orange-50 text-orange-700",
    high: "bg-rose-50 text-rose-700",
  }[severity];
}

function describeFunnelStep(
  step: Pick<FunnelStepInput, "event_type"> & {
    page_path?: string | null;
    element_id?: string | null;
  },
): string {
  const conditions = [step.event_type];

  if (step.page_path) {
    conditions.push(`página: ${step.page_path}`);
  }

  if (step.element_id) {
    conditions.push(`elemento: #${step.element_id}`);
  }

  return conditions.join(" | ");
}

function readBackendMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as { detail?: unknown; message?: unknown };

  if (typeof body.detail === "string") {
    return body.detail;
  }

  if (Array.isArray(body.detail)) {
    return body.detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }

        return JSON.stringify(item);
      })
      .join(", ");
  }

  if (typeof body.message === "string") {
    return body.message;
  }

  return null;
}

async function parseApiError(response: Response): Promise<ApiError> {
  const fallback = response.statusText || "La solicitud falló";
  const responseText = await response.text();

  if (!responseText) {
    return {
      status: response.status,
      message: fallback,
    };
  }

  try {
    const payload = JSON.parse(responseText) as unknown;
    return {
      status: response.status,
      message: readBackendMessage(payload) ?? responseText,
    };
  } catch {
    return {
      status: response.status,
      message: responseText,
    };
  }
}

async function fetchJson<T>(
  path: string,
  token?: string,
  requestInit: RequestInit = {},
): Promise<T> {
  const headers = new Headers(requestInit.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return (await response.json()) as T;
}

function normalizeToken(value: string): string {
  return value.trim().replace(/^Bearer\s+/i, "").trim();
}

function StatusPill({ health }: { health: HealthState }) {
  const status = {
    checking: {
      label: "Comprobando",
      classes: "border-amber-200 bg-amber-50 text-amber-800",
      dot: "bg-amber-500",
    },
    online: {
      label: "En línea",
      classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dot: "bg-emerald-500",
    },
    offline: {
      label: "Sin conexión",
      classes: "border-rose-200 bg-rose-50 text-rose-700",
      dot: "bg-rose-500",
    },
  }[health];

  return (
    <div
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold ${status.classes}`}
    >
      <span className={`h-2 w-2 rounded-full ${status.dot}`} />
      {status.label}
    </div>
  );
}

function MetricCard({ label, value, detail, accent }: MetricCardProps) {
  const accents = {
    sky: "border-t-sky-500",
    emerald: "border-t-emerald-500",
    amber: "border-t-amber-500",
    violet: "border-t-violet-500",
  };

  return (
    <article className={`rounded-lg border border-slate-200 border-t-4 bg-white p-5 shadow-sm ${accents[accent]}`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 truncate text-3xl font-semibold tracking-tight text-slate-950" title={value}>
        {value}
      </p>
      <p className="mt-2 truncate text-xs text-slate-500" title={detail}>
        {detail}
      </p>
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export default function Home() {
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [isTokenVisible, setIsTokenVisible] = useState(false);
  const [health, setHealth] = useState<HealthState>("checking");
  const [summary, setSummary] = useState<EventsSummary>(emptySummary);
  const [sessionsSummary, setSessionsSummary] = useState<SessionsSummary>(emptySessionsSummary);
  const [uxSignalsSummary, setUXSignalsSummary] = useState<UXSignalsSummary>(emptyUXSignalsSummary);
  const [formAnalyticsSummary, setFormAnalyticsSummary] = useState<FormAnalyticsSummary>(emptyFormAnalyticsSummary);
  const [formAbandonment, setFormAbandonment] = useState<FormAnalyticsItem[]>([]);
  const [formFields, setFormFields] = useState<FormFieldAnalytics[]>([]);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [sessions, setSessions] = useState<AnalyticsSession[]>([]);
  const [rageClicks, setRageClicks] = useState<RageClickSignal[]>([]);
  const [deadClicks, setDeadClicks] = useState<DeadClickSignal[]>([]);
  const [clickHeatmap, setClickHeatmap] = useState<ClickHeatmapResponse>(emptyClickHeatmap);
  const [heatmapView, setHeatmapView] = useState<ClickHeatmapResponse>(emptyClickHeatmap);
  const [heatmapPage, setHeatmapPage] = useState("");
  const [heatmapSegment, setHeatmapSegment] = useState<HeatmapSegmentFilter>("all");
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("viewport");
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<ApiError | null>(null);
  const [funnelResult, setFunnelResult] = useState<FunnelAnalyzeResponse | null>(null);
  const [funnelError, setFunnelError] = useState<ApiError | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzingFunnel, setIsAnalyzingFunnel] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [pagePathFilter, setPagePathFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const eventsByType = useMemo(() => sortCounts(summary.events_by_type), [summary.events_by_type]);
  const topPages = useMemo(() => sortCounts(summary.top_pages), [summary.top_pages]);
  const topPage = topPages[0];
  const rageClicksByPage = useMemo(
    () => sortCounts(uxSignalsSummary.rage_clicks_by_page),
    [uxSignalsSummary.rage_clicks_by_page],
  );
  const rageClicksByElement = useMemo(
    () => sortCounts(uxSignalsSummary.rage_clicks_by_element),
    [uxSignalsSummary.rage_clicks_by_element],
  );
  const deadClicksByPage = useMemo(
    () => sortCounts(uxSignalsSummary.dead_clicks_by_page),
    [uxSignalsSummary.dead_clicks_by_page],
  );
  const deadClicksByElement = useMemo(
    () => sortCounts(uxSignalsSummary.dead_clicks_by_element),
    [uxSignalsSummary.dead_clicks_by_element],
  );
  const topDeadPage = deadClicksByPage[0];
  const mostProblematicField = formFields[0];
  const heatmapPages = useMemo(
    () => sortCounts(clickHeatmap.pages),
    [clickHeatmap.pages],
  );
  const heatmapElements = useMemo(
    () => sortCounts(clickHeatmap.element_clicks),
    [clickHeatmap.element_clicks],
  );
  const heatmapSegments = useMemo(
    () => sortCounts(clickHeatmap.viewport_segments),
    [clickHeatmap.viewport_segments],
  );
  const activeHeatmapPage =
    heatmapPage && clickHeatmap.pages[heatmapPage] !== undefined
      ? heatmapPage
      : heatmapPages[0]?.[0] ?? "";
  const heatmapViewElements = useMemo(
    () => sortCounts(heatmapView.element_clicks),
    [heatmapView.element_clicks],
  );
  const topHeatmapElement = heatmapViewElements[0];
  const primaryHeatmapSegment = useMemo(
    () =>
      sortCounts(heatmapView.viewport_segments).find(([, count]) => count > 0),
    [heatmapView.viewport_segments],
  );
  const heatmapPreviewPoints = useMemo(
    () =>
      heatmapView.points.filter(
        (
          point,
        ): point is ClickHeatmapPoint & {
          x_percent: number;
          y_percent: number;
        } => point.x_percent !== null && point.y_percent !== null,
      ),
    [heatmapView.points],
  );
  const documentPreviewPoints = useMemo(
    () =>
      heatmapView.document_points.filter(
        (
          point,
        ): point is ClickHeatmapDocumentPoint & {
          normalized_x: number;
          normalized_document_y: number;
        } =>
          point.normalized_x !== null
          && point.normalized_document_y !== null,
      ),
    [heatmapView.document_points],
  );
  const documentHeight = (
    heatmapView.document_height_summary.median
    ?? heatmapView.document_height_summary.average
  );
  const aboveFoldClicks = useMemo(
    () =>
      heatmapView.document_points.filter(
        (point) =>
          point.viewport_height !== null
          && point.viewport_height > 0
          && point.absolute_y <= point.viewport_height,
      ).length,
    [heatmapView.document_points],
  );
  const belowFoldClicks = useMemo(
    () =>
      heatmapView.document_points.filter(
        (point) =>
          point.viewport_height !== null
          && point.viewport_height > 0
          && point.absolute_y > point.viewport_height,
      ).length,
    [heatmapView.document_points],
  );
  const hottestDocumentZone = useMemo(
    () =>
      [...heatmapView.document_intensity_zones]
        .sort((first, second) => second.count - first.count)[0],
    [heatmapView.document_intensity_zones],
  );
  const foldPositionPercent = useMemo(() => {
    const foldRatios = heatmapView.document_points
      .filter(
        (point) =>
          point.viewport_height !== null
          && point.viewport_height > 0
          && point.document_height !== null
          && point.document_height > 0,
      )
      .map((point) => (point.viewport_height! / point.document_height!) * 100);

    if (!foldRatios.length) {
      return null;
    }

    const averageRatio =
      foldRatios.reduce((total, ratio) => total + ratio, 0) / foldRatios.length;
    return Math.min(100, Math.max(4, averageRatio));
  }, [heatmapView.document_points]);

  const eventTypeOptions = useMemo(
    () => Array.from(new Set(events.map((event) => event.event_type))).sort(),
    [events],
  );

  const pagePathOptions = useMemo(
    () =>
      Array.from(new Set(events.map((event) => displayPage(event.page_path || event.page_url)))).sort(),
    [events],
  );

  const filteredEvents = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return events.filter((event) => {
      const page = displayPage(event.page_path || event.page_url);
      const matchesType = !eventTypeFilter || event.event_type === eventTypeFilter;
      const matchesPage = !pagePathFilter || page === pagePathFilter;
      const searchableText = [
        event.event_type,
        page,
        event.element_text,
        event.element_id,
        event.session_id,
        event.project_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);

      return matchesType && matchesPage && matchesSearch;
    });
  }, [eventTypeFilter, events, pagePathFilter, searchQuery]);

  const filtersActive = Boolean(eventTypeFilter || pagePathFilter || searchQuery.trim());

  const loadHealth = useCallback(async () => {
    setHealth("checking");

    try {
      await fetchJson<{ status: string }>("/health");
      setHealth("online");
    } catch {
      setHealth("offline");
    }
  }, []);

  const loadAnalytics = useCallback(async (token: string): Promise<boolean> => {
    const trimmedToken = normalizeToken(token);

    if (!trimmedToken) {
      setSummary(emptySummary);
      setSessionsSummary(emptySessionsSummary);
      setUXSignalsSummary(emptyUXSignalsSummary);
      setFormAnalyticsSummary(emptyFormAnalyticsSummary);
      setFormAbandonment([]);
      setFormFields([]);
      setEvents([]);
      setSessions([]);
      setRageClicks([]);
      setDeadClicks([]);
      setClickHeatmap(emptyClickHeatmap);
      setHeatmapView(emptyClickHeatmap);
      setHeatmapPage("");
      setHeatmapSegment("all");
      setHeatmapMode("viewport");
      setHeatmapError(null);
      setError(null);
      setLastUpdated(null);
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      await fetchJson<AuthContext>("/v1/auth/whoami", trimmedToken);

      const [
        nextSummary,
        nextEvents,
        nextSessionsSummary,
        nextSessions,
        nextUXSignalsSummary,
        nextRageClicks,
        nextDeadClicks,
        nextClickHeatmap,
        nextFormAnalyticsSummary,
        nextFormAbandonment,
        nextFormFields,
      ] = await Promise.all([
        fetchJson<EventsSummary>("/v1/events/summary", trimmedToken),
        fetchJson<AnalyticsEvent[]>("/v1/events?limit=25", trimmedToken),
        fetchJson<SessionsSummary>("/v1/sessions/summary", trimmedToken),
        fetchJson<AnalyticsSession[]>("/v1/sessions?limit=25", trimmedToken),
        fetchJson<UXSignalsSummary>("/v1/ux-signals/summary", trimmedToken),
        fetchJson<RageClickSignal[]>("/v1/ux-signals/rage-clicks?limit=25", trimmedToken),
        fetchJson<DeadClickSignal[]>("/v1/ux-signals/dead-clicks?limit=25", trimmedToken),
        fetchJson<ClickHeatmapResponse>("/v1/heatmaps/clicks?limit=1000", trimmedToken),
        fetchJson<FormAnalyticsSummary>("/v1/forms/summary", trimmedToken),
        fetchJson<FormAnalyticsItem[]>("/v1/forms/abandonment?limit=25", trimmedToken),
        fetchJson<FormFieldAnalytics[]>("/v1/forms/fields?limit=25", trimmedToken),
      ]);

      setSummary(nextSummary);
      setEvents(nextEvents);
      setSessionsSummary(nextSessionsSummary);
      setSessions(nextSessions);
      setUXSignalsSummary(nextUXSignalsSummary);
      setRageClicks(nextRageClicks);
      setDeadClicks(nextDeadClicks);
      setClickHeatmap(nextClickHeatmap);
      setHeatmapView(nextClickHeatmap);
      setFormAnalyticsSummary(nextFormAnalyticsSummary);
      setFormAbandonment(nextFormAbandonment);
      setFormFields(nextFormFields);
      setLastUpdated(new Date().toLocaleTimeString());
      return true;
    } catch (nextError) {
      if (nextError && typeof nextError === "object" && "status" in nextError) {
        const apiError = nextError as ApiError;
        setError({
          ...apiError,
          message:
            apiError.status === 401
              ? "La clave enviada no coincide con ninguna API key válida. Borra el token guardado y vuelve a pegarlo desde el archivo .env."
              : apiError.message,
        });

        if (apiError.status === 401) {
          window.localStorage.removeItem(TOKEN_STORAGE_KEY);
          setSavedToken("");
        }
      } else {
        setError({
          status: 0,
          message: nextError instanceof Error ? nextError.message : "No se pudieron cargar los datos.",
        });
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!savedToken || !activeHeatmapPage) {
      return;
    }

    const loadFilteredHeatmap = async () => {
      const params = new URLSearchParams({
        limit: "1000",
        page_path: activeHeatmapPage,
      });

      if (heatmapSegment !== "all") {
        params.set("viewport_segment", heatmapSegment);
      }

      setIsHeatmapLoading(true);
      setHeatmapError(null);

      try {
        const result = await fetchJson<ClickHeatmapResponse>(
          `/v1/heatmaps/clicks?${params.toString()}`,
          savedToken,
        );

        if (!cancelled) {
          setHeatmapView(result);
        }
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        if (nextError && typeof nextError === "object" && "status" in nextError) {
          setHeatmapError(nextError as ApiError);
        } else {
          setHeatmapError({
            status: 0,
            message:
              nextError instanceof Error
                ? nextError.message
                : "No se pudieron cargar los datos filtrados del mapa de clics.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsHeatmapLoading(false);
        }
      }
    };

    void loadFilteredHeatmap();

    return () => {
      cancelled = true;
    };
  }, [
    activeHeatmapPage,
    clickHeatmap,
    heatmapSegment,
    savedToken,
  ]);

  const refreshDashboard = useCallback(
    async (token = savedToken) => {
      await Promise.all([loadHealth(), loadAnalytics(token)]);
    },
    [loadAnalytics, loadHealth, savedToken],
  );

  const analyzeDefaultFunnel = useCallback(async () => {
    if (!savedToken) {
      setFunnelError({
        status: 0,
        message: "Guarda una master key o una API key de proyecto antes de analizar un embudo.",
      });
      return;
    }

    setIsAnalyzingFunnel(true);
    setFunnelError(null);

    try {
      const result = await fetchJson<FunnelAnalyzeResponse>(
        "/v1/funnels/analyze",
        savedToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            steps: defaultFunnelSteps,
          }),
        },
      );

      setFunnelResult(result);
    } catch (nextError) {
      if (nextError && typeof nextError === "object" && "status" in nextError) {
        setFunnelError(nextError as ApiError);
      } else {
        setFunnelError({
          status: 0,
          message: nextError instanceof Error ? nextError.message : "No se pudo analizar el embudo.",
        });
      }
    } finally {
      setIsAnalyzingFunnel(false);
    }
  }, [savedToken]);

  useEffect(() => {
    const initializeDashboardTimeout = window.setTimeout(() => {
      const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";

      setTokenInput(storedToken);
      setSavedToken(storedToken);
      void loadHealth();

      if (storedToken) {
        void loadAnalytics(storedToken);
      }
    }, 0);

    return () => window.clearTimeout(initializeDashboardTimeout);
  }, [loadAnalytics, loadHealth]);

  async function handleSaveToken() {
    const currentToken = tokenInputRef.current?.value ?? tokenInput;
    const trimmedToken = normalizeToken(currentToken);

    if (!trimmedToken) {
      setError({
        status: 0,
        message: "Pega un token antes de guardarlo.",
      });
      return;
    }

    setTokenInput(trimmedToken);
    setFunnelResult(null);
    setFunnelError(null);
    const isValid = await loadAnalytics(trimmedToken);

    if (!isValid) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setSavedToken("");
      return;
    }

    window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmedToken);
    setSavedToken(trimmedToken);
  }

  function handleClearToken() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setTokenInput("");
    setSavedToken("");
    setIsTokenVisible(false);
    setSummary(emptySummary);
    setSessionsSummary(emptySessionsSummary);
    setUXSignalsSummary(emptyUXSignalsSummary);
    setFormAnalyticsSummary(emptyFormAnalyticsSummary);
    setFormAbandonment([]);
    setFormFields([]);
    setEvents([]);
    setSessions([]);
    setRageClicks([]);
    setDeadClicks([]);
    setClickHeatmap(emptyClickHeatmap);
    setHeatmapView(emptyClickHeatmap);
    setHeatmapPage("");
    setHeatmapSegment("all");
    setHeatmapMode("viewport");
    setHeatmapError(null);
    setFunnelResult(null);
    setFunnelError(null);
    setError(null);
    setLastUpdated(null);
    clearFilters();
  }

  function handleToggleTokenVisibility() {
    const currentToken = tokenInputRef.current?.value ?? tokenInput;
    setTokenInput(currentToken);
    setIsTokenVisible((isVisible) => !isVisible);
  }

  function clearFilters() {
    setEventTypeFilter("");
    setPagePathFilter("");
    setSearchQuery("");
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sky-700">Panel V1.1</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">UXPulse Analytics</h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">Analítica autohospedada del comportamiento UX</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusPill health={health} />
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              disabled={isLoading}
              className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Actualizando..." : "Actualizar datos"}
            </button>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Token de lectura de analítica</h2>
              <p className="text-xs text-slate-500">Guardado únicamente en el localStorage de este navegador.</p>
            </div>
            {lastUpdated ? (
              <p className="text-xs text-slate-500">Última actualización: {lastUpdated}</p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <input
                ref={tokenInputRef}
                id="token"
                type={isTokenVisible ? "text" : "password"}
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                onInput={(event) => setTokenInput(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSaveToken();
                  }
                }}
                placeholder="Pega una master key o una API key de lectura"
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-24 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
              <button
                type="button"
                onClick={handleToggleTokenVisibility}
                className="absolute inset-y-1 right-1 cursor-pointer rounded-md px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                aria-label={isTokenVisible ? "Ocultar token" : "Mostrar token"}
                title={isTokenVisible ? "Ocultar token" : "Mostrar token"}
              >
                {isTokenVisible ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:flex">
              <button
                type="button"
                onClick={() => void handleSaveToken()}
                disabled={isLoading}
                className="h-11 cursor-pointer rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Guardar token
              </button>
              <button
                type="button"
                onClick={handleClearToken}
                className="h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Borrar token
              </button>
            </div>
          </div>

          {!savedToken && !error ? (
            <p className="mt-3 text-sm text-slate-500">Pega una master key o una API key de lectura para cargar la analítica.</p>
          ) : savedToken && !error ? (
            <p className="mt-3 text-sm text-emerald-700">Token guardado. El acceso a la analítica está listo.</p>
          ) : null}
        </section>

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700" />
            Cargando datos de analítica...
          </div>
        ) : null}

        {error ? (
          <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800" role="alert">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold">No se pudo cargar la analítica</h2>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {error.status ? `HTTP ${error.status}` : "Error de conexión"}
              </span>
            </div>
            <p className="mt-2 text-sm">{error.message}</p>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Eventos totales"
            value={summary.total_events.toLocaleString()}
            detail="Todos los eventos visibles para este token"
            accent="sky"
          />
          <MetricCard
            label="Tipos de evento"
            value={eventsByType.length.toLocaleString()}
            detail={eventsByType[0] ? `Más frecuente: ${eventsByType[0][0]}` : "Aún no hay tipos de evento"}
            accent="emerald"
          />
          <MetricCard
            label="Página principal"
            value={displayPage(topPage?.[0])}
            detail={topPage ? `${topPage[1].toLocaleString()} eventos` : "Aún no hay datos de páginas"}
            accent="amber"
          />
          <MetricCard
            label="Eventos recientes"
            value={events.length.toLocaleString()}
            detail="Últimos eventos cargados"
            accent="violet"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-base font-semibold">Eventos por tipo</h2>
              <p className="mt-1 text-sm text-slate-500">Distribución de eventos ordenada por volumen</p>
            </div>

            <div className="mt-5 space-y-4">
              {eventsByType.length ? (
                eventsByType.map(([type, count]) => {
                  const percentage = summary.total_events ? Math.round((count / summary.total_events) * 100) : 0;

                  return (
                    <div key={type}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium text-slate-700" title={type}>
                          {type}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500">
                          {count.toLocaleString()} ({percentage}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${Math.max(percentage, 3)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState>Aún no hay tipos de evento para mostrar.</EmptyState>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-base font-semibold">Páginas principales</h2>
              <p className="mt-1 text-sm text-slate-500">Páginas ordenadas por volumen de eventos</p>
            </div>

            <div className="mt-5 divide-y divide-slate-100">
              {topPages.length ? (
                topPages.map(([page, count], index) => (
                  <div key={`${page}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700" title={displayPage(page)}>
                      {displayPage(page)}
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600">
                      {count.toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState>Aún no hay páginas para mostrar.</EmptyState>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Analítica de formularios</h2>
            <p className="mt-1 text-sm text-slate-500">
              Inicios, envíos y abandonos calculados sin capturar valores escritos
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Formularios iniciados"
              value={formAnalyticsSummary.total_form_starts.toLocaleString()}
              detail={`${formAnalyticsSummary.total_forms.toLocaleString()} formularios detectados`}
              accent="sky"
            />
            <MetricCard
              label="Formularios enviados"
              value={formAnalyticsSummary.total_form_submits.toLocaleString()}
              detail="Envíos registrados correctamente"
              accent="emerald"
            />
            <MetricCard
              label="Formularios abandonados"
              value={formAnalyticsSummary.total_form_abandons.toLocaleString()}
              detail="Sesiones que salieron sin enviar"
              accent="amber"
            />
            <MetricCard
              label="Tasa de envío"
              value={`${formAnalyticsSummary.overall_submit_rate.toFixed(2)}%`}
              detail="Envíos respecto a formularios iniciados"
              accent="violet"
            />
            <MetricCard
              label="Tasa de abandono"
              value={`${formAnalyticsSummary.overall_abandon_rate.toFixed(2)}%`}
              detail="Abandonos respecto a formularios iniciados"
              accent="amber"
            />
          </div>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Formularios con abandono</h3>
              <p className="mt-1 text-sm text-slate-500">
                Rendimiento y último campo habitual antes de abandonar
              </p>
            </div>

            <div className="overflow-x-auto">
              {formAbandonment.length ? (
                <table className="min-w-[1120px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Página</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Formulario</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Inicios</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Envíos</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Abandonos</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Tasa de abandono</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Último campo común</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Campos tocados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {formAbandonment.map((form) => (
                      <tr
                        key={`${form.project_id}-${form.page_path}-${form.form_id || form.form_name || form.form_index}`}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate font-medium text-slate-700" title={form.page_path}>
                            {displayPage(form.page_path)}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate font-mono text-xs text-slate-600" title={displayForm(form)}>
                            {displayForm(form)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">
                          {form.starts.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {form.submits.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                          {form.abandons.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                          {form.abandon_rate.toFixed(2)}%
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate text-slate-600" title={form.most_common_last_field || "Sin datos"}>
                            {form.most_common_last_field || "Sin datos"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {form.average_fields_touched_before_abandon.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5">
                  <EmptyState>
                    No hay abandonos de formularios en el alcance actual.
                  </EmptyState>
                </div>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div>
                <h3 className="text-base font-semibold">Interacción por campo</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Foco, salida, tiempo promedio y abandonos por último campo
                </p>
              </div>
              <p className="text-sm text-slate-500">
                Campo más problemático:{" "}
                <span className="font-semibold text-slate-800">
                  {mostProblematicField
                    ? displayFormField(mostProblematicField)
                    : "Sin datos"}
                </span>
              </p>
            </div>

            <div className="overflow-x-auto">
              {formFields.length ? (
                <table className="min-w-[1040px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Página</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Formulario</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Campo</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Tipo</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Focos</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Salidas</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Último antes de abandono</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Tiempo promedio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {formFields.map((field) => (
                      <tr
                        key={`${field.project_id}-${field.page_path}-${field.form_id || field.form_name}-${field.field_id || field.field_name || field.field_index}`}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="max-w-52 px-4 py-3">
                          <p className="truncate font-medium text-slate-700" title={field.page_path}>
                            {displayPage(field.page_path)}
                          </p>
                        </td>
                        <td className="max-w-52 px-4 py-3">
                          <p
                            className="truncate font-mono text-xs text-slate-500"
                            title={displayForm({ ...field, form_index: null })}
                          >
                            {displayForm({ ...field, form_index: null })}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate font-medium text-slate-700" title={displayFormField(field)}>
                            {displayFormField(field)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{field.field_type}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {field.focus_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {field.blur_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-700">
                          {field.abandon_count_as_last_field.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {formatMilliseconds(field.average_time_on_field_ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5">
                  <EmptyState>
                    No hay interacción de campos de formulario para mostrar.
                  </EmptyState>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Sesiones</h2>
            <p className="mt-1 text-sm text-slate-500">Actividad agrupada por proyecto y sesión del navegador</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Sesiones totales"
              value={sessionsSummary.total_sessions.toLocaleString()}
              detail="Todas las sesiones visibles para este token"
              accent="sky"
            />
            <MetricCard
              label="Eventos promedio por sesión"
              value={sessionsSummary.average_events_per_session.toFixed(2)}
              detail="Promedio de interacciones registradas"
              accent="emerald"
            />
            <MetricCard
              label="Duración promedio"
              value={formatDuration(sessionsSummary.average_duration_seconds)}
              detail="Tiempo aproximado entre el primer y último evento"
              accent="amber"
            />
          </div>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Sesiones recientes</h3>
              <p className="mt-1 text-sm text-slate-500">
                Últimas {sessions.length} sesiones visibles para el token actual
              </p>
            </div>

            <div className="overflow-x-auto">
              {sessions.length ? (
                <table className="min-w-[980px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        ID de sesión
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Primera página
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Última página
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Eventos
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Duración
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Último evento
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessions.map((session) => (
                      <tr key={`${session.project_id}-${session.session_id}`} className="transition hover:bg-slate-50">
                        <td className="max-w-64 px-4 py-3">
                          <p className="truncate font-mono text-xs text-slate-600" title={session.session_id}>
                            {session.session_id}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate font-medium text-slate-700" title={displayPage(session.first_page)}>
                            {displayPage(session.first_page)}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate text-slate-600" title={displayPage(session.last_page)}>
                            {displayPage(session.last_page)}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums text-slate-700">
                          {session.total_events.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatDuration(session.duration_seconds)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {formatDate(session.last_event_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5">
                  <EmptyState>Aún no hay sesiones para mostrar.</EmptyState>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Señales UX V1</h2>
            <p className="mt-1 text-sm text-slate-500">
              Señales de fricción calculadas a partir de los eventos de interacción
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Señales UX totales"
              value={uxSignalsSummary.total_signals.toLocaleString()}
              detail="Todas las señales de fricción detectadas"
              accent="sky"
            />
            <MetricCard
              label="Clics de frustración"
              value={uxSignalsSummary.total_rage_clicks.toLocaleString()}
              detail="Grupos de clics rápidos y repetidos"
              accent="amber"
            />
            <MetricCard
              label="Clics sin respuesta"
              value={uxSignalsSummary.total_dead_clicks.toLocaleString()}
              detail="Clics sin una respuesta detectada"
              accent="violet"
            />
            <MetricCard
              label="Página con más clics sin respuesta"
              value={displayPage(topDeadPage?.[0])}
              detail={topDeadPage ? `${topDeadPage[1]} señales detectadas` : "No se detectaron clics sin respuesta"}
              accent="emerald"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clics de frustración por página</h3>
              <p className="mt-1 text-sm text-slate-500">Páginas ordenadas por grupos detectados</p>

              <div className="mt-5 divide-y divide-slate-100">
                {rageClicksByPage.length ? (
                  rageClicksByPage.map(([page, count], index) => (
                    <div key={page} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700" title={displayPage(page)}>
                        {displayPage(page)}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState>No se detectaron páginas con clics de frustración.</EmptyState>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clics de frustración por elemento</h3>
              <p className="mt-1 text-sm text-slate-500">Elementos y zonas de coordenadas que generan fricción</p>

              <div className="mt-5 divide-y divide-slate-100">
                {rageClicksByElement.length ? (
                  rageClicksByElement.map(([element, count], index) => (
                    <div key={element} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700"
                        title={displayElementRanking(element)}
                      >
                        {displayElementRanking(element)}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState>No se detectaron elementos con clics de frustración.</EmptyState>
                )}
              </div>
            </article>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clics sin respuesta por página</h3>
              <p className="mt-1 text-sm text-slate-500">
                Páginas ordenadas por clics sin una respuesta detectada
              </p>

              <div className="mt-5 divide-y divide-slate-100">
                {deadClicksByPage.length ? (
                  deadClicksByPage.map(([page, count], index) => (
                    <div key={page} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700"
                        title={displayPage(page)}
                      >
                        {displayPage(page)}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState>No se detectaron páginas con clics sin respuesta.</EmptyState>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clics sin respuesta por elemento</h3>
              <p className="mt-1 text-sm text-slate-500">
                Elementos y zonas de coordenadas que podrían no responder
              </p>

              <div className="mt-5 divide-y divide-slate-100">
                {deadClicksByElement.length ? (
                  deadClicksByElement.map(([element, count], index) => (
                    <div key={element} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700"
                        title={displayElementRanking(element)}
                      >
                        {displayElementRanking(element)}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState>No se detectaron elementos con clics sin respuesta.</EmptyState>
                )}
              </div>
            </article>
          </div>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Clics de frustración detectados</h3>
              <p className="mt-1 text-sm text-slate-500">
                Últimas {rageClicks.length} señales visibles para el token actual
              </p>
            </div>

            <div className="overflow-x-auto">
              {rageClicks.length ? (
                <table className="min-w-[980px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Ruta de página
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Elemento
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        ID de sesión
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Clics
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Severidad
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Hora
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rageClicks.map((signal) => (
                      <tr
                        key={`${signal.project_id}-${signal.session_id}-${signal.first_click_at}`}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate font-medium text-slate-700" title={displayPage(signal.page_path)}>
                            {displayPage(signal.page_path)}
                          </p>
                        </td>
                        <td className="max-w-64 px-4 py-3">
                          <p className="truncate text-slate-600" title={displaySignalElement(signal)}>
                            {displaySignalElement(signal)}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate font-mono text-xs text-slate-500" title={signal.session_id}>
                            {signal.session_id}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">
                          {signal.clicks_count}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${severityClasses(signal.severity)}`}>
                            {displaySeverity(signal.severity)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          <p>{formatDate(signal.last_click_at)}</p>
                          <p className="mt-0.5 text-xs">ráfaga de {signal.duration_ms} ms</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5">
                  <EmptyState>No se detectaron clics de frustración en el alcance actual.</EmptyState>
                </div>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Clics sin respuesta detectados</h3>
              <p className="mt-1 text-sm text-slate-500">
                Últimas {deadClicks.length} señales visibles para el token actual
              </p>
            </div>

            <div className="overflow-x-auto">
              {deadClicks.length ? (
                <table className="min-w-[900px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Ruta de página
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Elemento
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        ID de sesión
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Severidad
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Fecha del clic
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deadClicks.map((signal) => (
                      <tr
                        key={`${signal.project_id}-${signal.session_id}-${signal.clicked_at}`}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="max-w-56 px-4 py-3">
                          <p
                            className="truncate font-medium text-slate-700"
                            title={displayPage(signal.page_path)}
                          >
                            {displayPage(signal.page_path)}
                          </p>
                        </td>
                        <td className="max-w-64 px-4 py-3">
                          <p
                            className="truncate text-slate-600"
                            title={displayDeadClickElement(signal)}
                          >
                            {displayDeadClickElement(signal)}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p
                            className="truncate font-mono text-xs text-slate-500"
                            title={signal.session_id}
                          >
                            {signal.session_id}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${severityClasses(signal.severity)}`}
                          >
                            {displaySeverity(signal.severity)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {formatDate(signal.clicked_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5">
                  <EmptyState>No se detectaron clics sin respuesta en el alcance actual.</EmptyState>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Mapa de clics V3</h2>
              <p className="mt-1 text-sm text-slate-500">
                Densidad de clics por viewport y página completa según el desplazamiento
              </p>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto">
              <label className="w-full xl:w-72">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Página
                </span>
                <select
                  value={activeHeatmapPage}
                  onChange={(event) => setHeatmapPage(event.target.value)}
                  disabled={!heatmapPages.length}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  {heatmapPages.length ? (
                    heatmapPages.map(([page, count]) => (
                      <option key={page} value={page}>
                        {displayPage(page)} ({count})
                      </option>
                    ))
                  ) : (
                    <option value="">No hay páginas con clics</option>
                  )}
                </select>
              </label>

              <label className="w-full xl:w-52">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Segmento de pantalla
                </span>
                <select
                  value={heatmapSegment}
                  onChange={(event) =>
                    setHeatmapSegment(event.target.value as HeatmapSegmentFilter)
                  }
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="all">Todos</option>
                  <option value="desktop">Escritorio</option>
                  <option value="tablet">Tablet</option>
                  <option value="mobile">Móvil</option>
                  <option value="unknown">Desconocido</option>
                </select>
              </label>

              <div className="w-full xl:w-56">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Modo del mapa
                </span>
                <div className="grid h-10 grid-cols-2 rounded-lg border border-slate-300 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setHeatmapMode("viewport")}
                    aria-pressed={heatmapMode === "viewport"}
                    className={`rounded-md px-3 text-sm font-semibold transition ${
                      heatmapMode === "viewport"
                        ? "bg-slate-950 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Viewport
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeatmapMode("full_page")}
                    aria-pressed={heatmapMode === "full_page"}
                    className={`rounded-md px-3 text-sm font-semibold transition ${
                      heatmapMode === "full_page"
                        ? "bg-slate-950 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Página completa
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Clics filtrados"
              value={heatmapView.total_clicks.toLocaleString()}
              detail={`${displayPage(activeHeatmapPage)} / ${heatmapSegment === "all" ? "Todos los viewports" : displayViewportSegment(heatmapSegment)}`}
              accent="sky"
            />
            <MetricCard
              label="Páginas con clics"
              value={heatmapPages.length.toLocaleString()}
              detail={`${clickHeatmap.total_clicks.toLocaleString()} clics en todas las páginas`}
              accent="emerald"
            />
            <MetricCard
              label="Elemento principal"
              value={
                topHeatmapElement
                  ? displayElementRanking(topHeatmapElement[0])
                  : "Sin elemento"
              }
              detail={
                topHeatmapElement
                  ? `${topHeatmapElement[1].toLocaleString()} clics filtrados`
                  : "No hay datos de elementos"
              }
              accent="amber"
            />
            <MetricCard
              label="Segmento principal"
              value={
                primaryHeatmapSegment
                  ? displayViewportSegment(
                      primaryHeatmapSegment[0] as ViewportSegment,
                    )
                  : "Sin segmento"
              }
              detail={
                primaryHeatmapSegment
                  ? `${primaryHeatmapSegment[1].toLocaleString()} clics filtrados`
                  : "No hay datos de viewport"
              }
              accent="violet"
            />
          </div>

          {heatmapMode === "full_page" ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Altura mediana del documento"
                value={documentHeight !== null ? `${Math.round(documentHeight).toLocaleString()} px` : "Desconocida"}
                detail={`${heatmapView.document_height_summary.count.toLocaleString()} clics con altura del documento`}
                accent="sky"
              />
              <MetricCard
                label="Sobre el primer pliegue"
                value={aboveFoldClicks.toLocaleString()}
                detail="Clics dentro del primer viewport"
                accent="emerald"
              />
              <MetricCard
                label="Bajo el primer pliegue"
                value={belowFoldClicks.toLocaleString()}
                detail="Clics después del primer viewport"
                accent="amber"
              />
              <MetricCard
                label="Zona más activa"
                value={
                  hottestDocumentZone
                    ? `C${hottestDocumentZone.column + 1} / R${hottestDocumentZone.row + 1}`
                    : "Sin zona"
                }
                detail={
                  hottestDocumentZone
                    ? `${hottestDocumentZone.count.toLocaleString()} clics`
                    : "No hay puntos normalizados"
                }
                accent="violet"
              />
            </div>
          ) : null}

          {heatmapError ? (
            <div
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              role="alert"
            >
              <span className="font-semibold">
                {heatmapError.status ? `HTTP ${heatmapError.status}: ` : ""}
              </span>
              {heatmapError.message}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clics por página</h3>
              <p className="mt-1 text-sm text-slate-500">Páginas ordenadas por coordenadas de clic válidas</p>

              <div className="mt-5 divide-y divide-slate-100">
                {heatmapPages.length ? (
                  heatmapPages.map(([page, count], index) => (
                    <div key={page} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700"
                        title={displayPage(page)}
                      >
                        {displayPage(page)}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState>No hay páginas con clics para el mapa.</EmptyState>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clics por elemento</h3>
              <p className="mt-1 text-sm text-slate-500">Elementos ordenados por coordenadas de clic válidas</p>

              <div className="mt-5 divide-y divide-slate-100">
                {heatmapElements.length ? (
                  heatmapElements.map(([element, count], index) => (
                    <div key={element} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700"
                        title={displayElementRanking(element)}
                      >
                        {displayElementRanking(element)}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState>No hay elementos con clics para el mapa.</EmptyState>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clics por viewport</h3>
              <p className="mt-1 text-sm text-slate-500">
                Segmentos por ancho de dispositivo en todas las páginas
              </p>

              <div className="mt-5 divide-y divide-slate-100">
                {heatmapSegments.map(([segment, count], index) => (
                  <div
                    key={segment}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                      {displayViewportSegment(segment as ViewportSegment)}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-600">
                      {count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-1 border-b border-slate-200 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div>
                <h3 className="text-base font-semibold">Vista previa del mapa</h3>
                <p className="mt-1 truncate text-sm text-slate-500" title={displayPage(activeHeatmapPage)}>
                  {displayPage(activeHeatmapPage)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-slate-600">
                {isHeatmapLoading
                  ? "Actualizando..."
                  : `${heatmapView.total_clicks.toLocaleString()} clics`}
              </p>
            </div>

            <div className="p-4 sm:p-5">
              {heatmapView.total_clicks ? (
                heatmapMode === "viewport" ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                    {[25, 50, 75].map((position) => (
                      <div
                        key={`vertical-${position}`}
                        className="absolute inset-y-0 w-px bg-slate-200"
                        style={{ left: `${position}%` }}
                      />
                    ))}
                    {[25, 50, 75].map((position) => (
                      <div
                        key={`horizontal-${position}`}
                        className="absolute inset-x-0 h-px bg-slate-200"
                        style={{ top: `${position}%` }}
                      />
                    ))}
                    {heatmapView.intensity_zones.map((zone) => (
                      <span
                        key={`zone-${zone.column}-${zone.row}`}
                        className="absolute bg-rose-500"
                        style={{
                          left: `${(zone.column / 12) * 100}%`,
                          top: `${(zone.row / 8) * 100}%`,
                          width: `${100 / 12}%`,
                          height: `${100 / 8}%`,
                          opacity: 0.08 + zone.intensity * 0.42,
                        }}
                        title={`Zona ${zone.column + 1}, ${zone.row + 1}: ${zone.count} clics`}
                      />
                    ))}
                    {heatmapPreviewPoints.map((point) => (
                      <span
                        key={point.event_id}
                        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-700/50 bg-rose-500/60 shadow-sm"
                        style={{
                          left: `${point.x_percent}%`,
                          top: `${point.y_percent}%`,
                        }}
                        title={`${displayElementRanking(point.element_id || "coordinate_zone")} en ${point.x_percent}%, ${point.y_percent}%`}
                      />
                    ))}
                    {!heatmapPreviewPoints.length ? (
                      <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-medium text-slate-500">
                        Los clics de este segmento no tienen un viewport completo.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="max-h-[720px] overflow-y-auto rounded-lg border border-slate-300 bg-slate-100 p-3 sm:p-5">
                    <div className="relative mx-auto h-[1080px] w-full max-w-2xl overflow-hidden border border-slate-300 bg-white shadow-sm">
                      {[25, 50, 75].map((position) => (
                        <div
                          key={`document-vertical-${position}`}
                          className="absolute inset-y-0 w-px bg-slate-100"
                          style={{ left: `${position}%` }}
                        />
                      ))}
                      {[25, 50, 75].map((position) => (
                        <div
                          key={`document-horizontal-${position}`}
                          className="absolute inset-x-0 h-px bg-slate-200"
                          style={{ top: `${position}%` }}
                        >
                          <span className="absolute right-2 -translate-y-full pb-1 text-[10px] font-semibold text-slate-400">
                            {position}% de profundidad
                          </span>
                        </div>
                      ))}
                      {heatmapView.document_intensity_zones.map((zone) => (
                        <span
                          key={`document-zone-${zone.column}-${zone.row}`}
                          className="absolute bg-rose-500"
                          style={{
                            left: `${(zone.column / 12) * 100}%`,
                            top: `${(zone.row / 24) * 100}%`,
                            width: `${100 / 12}%`,
                            height: `${100 / 24}%`,
                            opacity: 0.07 + zone.intensity * 0.43,
                          }}
                          title={`Zona del documento ${zone.column + 1}, ${zone.row + 1}: ${zone.count} clics`}
                        />
                      ))}
                      {foldPositionPercent !== null ? (
                        <div
                          className="absolute inset-x-0 z-10 border-t-2 border-dashed border-sky-600"
                          style={{ top: `${foldPositionPercent}%` }}
                        >
                          <span className="absolute left-2 top-1 rounded bg-sky-600 px-2 py-1 text-[10px] font-semibold uppercase text-white">
                            Primer pliegue del viewport
                          </span>
                        </div>
                      ) : null}
                      {documentPreviewPoints.map((point) => (
                        <span
                          key={point.event_id}
                          className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-800/60 bg-rose-500/70 shadow-sm"
                          style={{
                            left: `${point.normalized_x * 100}%`,
                            top: `${point.normalized_document_y * 100}%`,
                          }}
                          title={`${displayElementRanking(point.element_id || "coordinate_zone")} al ${Math.round(point.normalized_document_y * 100)}% de profundidad`}
                        />
                      ))}
                      {!documentPreviewPoints.length ? (
                        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm font-medium text-slate-500">
                          Los clics de este segmento no tienen geometría suficiente para ubicarlos en la página completa.
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              ) : (
                <EmptyState>No hay puntos de clic disponibles para esta página.</EmptyState>
              )}
            </div>
          </article>

          {heatmapMode === "full_page" ? (
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold">Clics por profundidad de desplazamiento</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Distribución sobre la altura normalizada del documento completo
                  </p>
                </div>
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Cuadrícula del documento 12 x 24
                </p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {heatmapView.scroll_depth_summary.map((bucket) => (
                  <div
                    key={bucket.range}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-700">
                        {bucket.range}%
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-slate-950">
                        {bucket.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{ width: `${bucket.intensity * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Puntos recientes del mapa</h3>
              <p className="mt-1 text-sm text-slate-500">
                Últimos {heatmapView.points.length} puntos que coinciden con los filtros
              </p>
            </div>

            <div className="overflow-x-auto">
              {heatmapView.points.length ? (
                <table className="min-w-[980px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Ruta de página</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Elemento</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Coordenadas</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Viewport</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Segmento</th>
                      <th scope="col" className="px-4 py-3 font-semibold">ID de sesión</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Ocurrió el</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {heatmapView.points.map((point) => (
                      <tr key={point.event_id} className="transition hover:bg-slate-50">
                        <td className="max-w-56 px-4 py-3">
                          <p
                            className="truncate font-medium text-slate-700"
                            title={displayPage(point.page_path)}
                          >
                            {displayPage(point.page_path)}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p
                            className="truncate text-slate-600"
                            title={displayElementRanking(point.element_id || "coordinate_zone")}
                          >
                            {displayElementRanking(point.element_id || "coordinate_zone")}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-slate-600">
                          {Math.round(point.x)}, {Math.round(point.y)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs text-slate-500">
                          {point.viewport_width && point.viewport_height
                            ? `${point.viewport_width} x ${point.viewport_height}`
                            : "Desconocido"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {displayViewportSegment(point.viewport_segment)}
                        </td>
                        <td className="max-w-52 px-4 py-3">
                          <p
                            className="truncate font-mono text-xs text-slate-500"
                            title={point.session_id}
                          >
                            {point.session_id}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {formatDate(point.occurred_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5">
                  <EmptyState>No hay coordenadas de clic válidas en el alcance actual.</EmptyState>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Embudos V1</h2>
              <p className="mt-1 text-sm text-slate-500">
                Conversión ordenada entre sesiones usando los eventos existentes
              </p>
            </div>
            <button
              type="button"
              onClick={() => void analyzeDefaultFunnel()}
              disabled={!savedToken || isAnalyzingFunnel}
              className="h-10 self-start rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
            >
              {isAnalyzingFunnel ? "Analizando..." : "Analizar embudo"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {defaultFunnelSteps.map((step, index) => (
              <article
                key={`${step.event_type}-${index}`}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Paso {index + 1}
                    </p>
                    <p className="truncate text-sm font-semibold text-slate-800" title={describeFunnelStep(step)}>
                      {describeFunnelStep(step)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {funnelError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
              <span className="font-semibold">
                {funnelError.status ? `HTTP ${funnelError.status}: ` : ""}
              </span>
              {funnelError.message}
            </div>
          ) : null}

          <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="grid divide-y divide-slate-200 border-b border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sesiones totales</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
                  {funnelResult ? funnelResult.total_sessions.toLocaleString() : "--"}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Conversión total
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
                  {funnelResult ? `${funnelResult.overall_conversion_rate.toFixed(2)}%` : "--"}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Abandono total</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-rose-700">
                  {funnelResult ? `${funnelResult.overall_dropoff_rate.toFixed(2)}%` : "--"}
                </p>
              </div>
            </div>

            {funnelResult ? (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Paso
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Condición
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Sesiones
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Desde el anterior
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Desde el inicio
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Abandono
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {funnelResult.steps.map((step) => (
                      <tr key={step.step_index} className="transition hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {step.step_index}
                        </td>
                        <td className="max-w-72 px-4 py-3">
                          <p
                            className="truncate font-medium text-slate-700"
                            title={describeFunnelStep(step)}
                          >
                            {describeFunnelStep(step)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">
                          {step.sessions_count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {step.conversion_from_previous.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {step.conversion_from_start.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-rose-700">
                          {step.dropoff_from_previous.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-slate-500">
                Analiza el embudo predefinido para calcular la conversión del alcance actual.
              </div>
            )}
          </article>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Eventos recientes</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Mostrando {filteredEvents.length} de {events.length} eventos cargados
                </p>
              </div>
              <button
                type="button"
                onClick={clearFilters}
                disabled={!filtersActive}
                className="h-9 self-start rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
              >
                Limpiar filtros
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tipo de evento
                </span>
                <select
                  value={eventTypeFilter}
                  onChange={(event) => setEventTypeFilter(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Todos los tipos de evento</option>
                  {eventTypeOptions.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {eventType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ruta de página
                </span>
                <select
                  value={pagePathFilter}
                  onChange={(event) => setPagePathFilter(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Todas las páginas</option>
                  {pagePathOptions.map((pagePath) => (
                    <option key={pagePath} value={pagePath}>
                      {pagePath}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Buscar
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Tipo, página, elemento, sesión..."
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredEvents.length ? (
              <table className="min-w-[960px] w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Tipo de evento
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Ruta de página
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Elemento
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      ID de sesión
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Creado el
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEvents.map((event) => {
                    const page = displayPage(event.page_path || event.page_url);
                    const element = event.element_text || event.element_id || "Sin elemento";

                    return (
                      <tr key={event.event_id} className="transition hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="inline-flex max-w-44 truncate rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                            {event.event_type}
                          </span>
                        </td>
                        <td className="max-w-64 px-4 py-3">
                          <p className="truncate font-medium text-slate-700" title={page}>
                            {page}
                          </p>
                        </td>
                        <td className="max-w-64 px-4 py-3">
                          <p className="truncate text-slate-500" title={element}>
                            {element}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p className="truncate font-mono text-xs text-slate-500" title={event.session_id}>
                            {event.session_id}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {formatDate(event.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-5">
                <EmptyState>
                  {events.length && filtersActive
                    ? "Ningún evento reciente coincide con los filtros actuales."
                    : "Aún no hay eventos recientes para mostrar."}
                </EmptyState>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
