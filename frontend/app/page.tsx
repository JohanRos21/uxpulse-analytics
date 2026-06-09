"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

type ClickHeatmapPoint = {
  event_id: string;
  project_id: string;
  session_id: string;
  page_path: string | null;
  element_id: string | null;
  x: number;
  y: number;
  viewport_width: number;
  viewport_height: number;
  x_percent: number;
  y_percent: number;
  occurred_at: string;
};

type ClickHeatmapResponse = {
  total_clicks: number;
  pages: Record<string, number>;
  element_clicks: Record<string, number>;
  points: ClickHeatmapPoint[];
};

type ApiError = {
  status: number;
  message: string;
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

const emptyClickHeatmap: ClickHeatmapResponse = {
  total_clicks: 0,
  pages: {},
  element_clicks: {},
  points: [],
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

  return new Intl.DateTimeFormat(undefined, {
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
    return "Unknown page";
  }

  return value;
}

function displaySignalElement(signal: RageClickSignal): string {
  if (signal.element_id) {
    return `#${signal.element_id}`;
  }

  if (signal.x !== null && signal.y !== null) {
    return `Coordinate zone (${Math.round(signal.x)}, ${Math.round(signal.y)})`;
  }

  return "Coordinate zone";
}

function displayDeadClickElement(signal: DeadClickSignal): string {
  if (signal.element_id) {
    return `#${signal.element_id}`;
  }

  if (signal.x !== null && signal.y !== null) {
    return `Coordinate zone (${Math.round(signal.x)}, ${Math.round(signal.y)})`;
  }

  return "Coordinate zone";
}

function displayElementRanking(value: string): string {
  return value === "coordinate_zone" ? "Coordinate zone" : `#${value}`;
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
    conditions.push(`page: ${step.page_path}`);
  }

  if (step.element_id) {
    conditions.push(`element: #${step.element_id}`);
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
  const fallback = response.statusText || "Request failed";
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

function StatusPill({ health }: { health: HealthState }) {
  const status = {
    checking: {
      label: "Checking",
      classes: "border-amber-200 bg-amber-50 text-amber-800",
      dot: "bg-amber-500",
    },
    online: {
      label: "Online",
      classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dot: "bg-emerald-500",
    },
    offline: {
      label: "Offline",
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
  const [tokenInput, setTokenInput] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [health, setHealth] = useState<HealthState>("checking");
  const [summary, setSummary] = useState<EventsSummary>(emptySummary);
  const [sessionsSummary, setSessionsSummary] = useState<SessionsSummary>(emptySessionsSummary);
  const [uxSignalsSummary, setUXSignalsSummary] = useState<UXSignalsSummary>(emptyUXSignalsSummary);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [sessions, setSessions] = useState<AnalyticsSession[]>([]);
  const [rageClicks, setRageClicks] = useState<RageClickSignal[]>([]);
  const [deadClicks, setDeadClicks] = useState<DeadClickSignal[]>([]);
  const [clickHeatmap, setClickHeatmap] = useState<ClickHeatmapResponse>(emptyClickHeatmap);
  const [heatmapPage, setHeatmapPage] = useState("");
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
  const heatmapPages = useMemo(
    () => sortCounts(clickHeatmap.pages),
    [clickHeatmap.pages],
  );
  const heatmapElements = useMemo(
    () => sortCounts(clickHeatmap.element_clicks),
    [clickHeatmap.element_clicks],
  );
  const activeHeatmapPage =
    heatmapPage && clickHeatmap.pages[heatmapPage] !== undefined
      ? heatmapPage
      : heatmapPages[0]?.[0] ?? "";
  const heatmapPreviewPoints = useMemo(
    () =>
      clickHeatmap.points.filter(
        (point) => (point.page_path || "unknown") === activeHeatmapPage,
      ),
    [activeHeatmapPage, clickHeatmap.points],
  );

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

  const loadAnalytics = useCallback(async (token: string) => {
    const trimmedToken = token.trim();

    if (!trimmedToken) {
      setSummary(emptySummary);
      setSessionsSummary(emptySessionsSummary);
      setUXSignalsSummary(emptyUXSignalsSummary);
      setEvents([]);
      setSessions([]);
      setRageClicks([]);
      setDeadClicks([]);
      setClickHeatmap(emptyClickHeatmap);
      setHeatmapPage("");
      setError(null);
      setLastUpdated(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [
        nextSummary,
        nextEvents,
        nextSessionsSummary,
        nextSessions,
        nextUXSignalsSummary,
        nextRageClicks,
        nextDeadClicks,
        nextClickHeatmap,
      ] = await Promise.all([
        fetchJson<EventsSummary>("/v1/events/summary", trimmedToken),
        fetchJson<AnalyticsEvent[]>("/v1/events?limit=25", trimmedToken),
        fetchJson<SessionsSummary>("/v1/sessions/summary", trimmedToken),
        fetchJson<AnalyticsSession[]>("/v1/sessions?limit=25", trimmedToken),
        fetchJson<UXSignalsSummary>("/v1/ux-signals/summary", trimmedToken),
        fetchJson<RageClickSignal[]>("/v1/ux-signals/rage-clicks?limit=25", trimmedToken),
        fetchJson<DeadClickSignal[]>("/v1/ux-signals/dead-clicks?limit=25", trimmedToken),
        fetchJson<ClickHeatmapResponse>("/v1/heatmaps/clicks?limit=1000", trimmedToken),
      ]);

      setSummary(nextSummary);
      setEvents(nextEvents);
      setSessionsSummary(nextSessionsSummary);
      setSessions(nextSessions);
      setUXSignalsSummary(nextUXSignalsSummary);
      setRageClicks(nextRageClicks);
      setDeadClicks(nextDeadClicks);
      setClickHeatmap(nextClickHeatmap);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (nextError) {
      if (nextError && typeof nextError === "object" && "status" in nextError) {
        setError(nextError as ApiError);
      } else {
        setError({
          status: 0,
          message: nextError instanceof Error ? nextError.message : "Unable to load analytics.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        message: "Save a master key or project API key before analyzing a funnel.",
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
          message: nextError instanceof Error ? nextError.message : "Unable to analyze funnel.",
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

  function handleSaveToken() {
    const trimmedToken = tokenInput.trim();

    if (!trimmedToken) {
      setError({
        status: 0,
        message: "Paste a token before saving.",
      });
      return;
    }

    window.localStorage.setItem(TOKEN_STORAGE_KEY, trimmedToken);
    setSavedToken(trimmedToken);
    setFunnelResult(null);
    setFunnelError(null);
    void loadAnalytics(trimmedToken);
  }

  function handleClearToken() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setTokenInput("");
    setSavedToken("");
    setSummary(emptySummary);
    setSessionsSummary(emptySessionsSummary);
    setUXSignalsSummary(emptyUXSignalsSummary);
    setEvents([]);
    setSessions([]);
    setRageClicks([]);
    setDeadClicks([]);
    setClickHeatmap(emptyClickHeatmap);
    setHeatmapPage("");
    setFunnelResult(null);
    setFunnelError(null);
    setError(null);
    setLastUpdated(null);
    clearFilters();
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sky-700">Dashboard V1.1</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">UXPulse Analytics</h1>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">Self-hosted UX behavior analytics</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusPill health={health} />
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              disabled={isLoading}
              className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Refreshing..." : "Refresh data"}
            </button>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Analytics read token</h2>
              <p className="text-xs text-slate-500">Stored only in this browser&apos;s localStorage.</p>
            </div>
            {lastUpdated ? (
              <p className="text-xs text-slate-500">Last updated at {lastUpdated}</p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row">
            <input
              id="token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSaveToken();
                }
              }}
              placeholder="Paste a master key or project read API key"
              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
            <div className="grid grid-cols-2 gap-3 lg:flex">
              <button
                type="button"
                onClick={handleSaveToken}
                disabled={isLoading}
                className="h-11 rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save token
              </button>
              <button
                type="button"
                onClick={handleClearToken}
                disabled={!tokenInput && !savedToken}
                className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear token
              </button>
            </div>
          </div>

          {!savedToken ? (
            <p className="mt-3 text-sm text-slate-500">Paste a master key or project read API key to load analytics.</p>
          ) : (
            <p className="mt-3 text-sm text-emerald-700">Token saved. Analytics access is ready.</p>
          )}
        </section>

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700" />
            Loading analytics data...
          </div>
        ) : null}

        {error ? (
          <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800" role="alert">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold">Unable to load analytics</h2>
              <span className="text-xs font-semibold uppercase tracking-wide">
                {error.status ? `HTTP ${error.status}` : "Connection error"}
              </span>
            </div>
            <p className="mt-2 text-sm">{error.message}</p>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Events"
            value={summary.total_events.toLocaleString()}
            detail="All events visible to this token"
            accent="sky"
          />
          <MetricCard
            label="Event Types Count"
            value={eventsByType.length.toLocaleString()}
            detail={eventsByType[0] ? `Most common: ${eventsByType[0][0]}` : "No event types yet"}
            accent="emerald"
          />
          <MetricCard
            label="Top Page"
            value={displayPage(topPage?.[0])}
            detail={topPage ? `${topPage[1].toLocaleString()} events` : "No page data yet"}
            accent="amber"
          />
          <MetricCard
            label="Recent Events Count"
            value={events.length.toLocaleString()}
            detail="Latest events currently loaded"
            accent="violet"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-base font-semibold">Events by Type</h2>
              <p className="mt-1 text-sm text-slate-500">Event distribution sorted by volume</p>
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
                <EmptyState>No event types to show yet.</EmptyState>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-base font-semibold">Top Pages</h2>
              <p className="mt-1 text-sm text-slate-500">Pages sorted by event volume</p>
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
                <EmptyState>No pages to show yet.</EmptyState>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Sessions</h2>
            <p className="mt-1 text-sm text-slate-500">Grouped activity by project and browser session</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Total Sessions"
              value={sessionsSummary.total_sessions.toLocaleString()}
              detail="All sessions visible to this token"
              accent="sky"
            />
            <MetricCard
              label="Average Events per Session"
              value={sessionsSummary.average_events_per_session.toFixed(2)}
              detail="Average tracked interactions"
              accent="emerald"
            />
            <MetricCard
              label="Average Duration"
              value={formatDuration(sessionsSummary.average_duration_seconds)}
              detail="Approximate first-to-last event time"
              accent="amber"
            />
          </div>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Recent Sessions</h3>
              <p className="mt-1 text-sm text-slate-500">
                Latest {sessions.length} sessions visible to the current token
              </p>
            </div>

            <div className="overflow-x-auto">
              {sessions.length ? (
                <table className="min-w-[980px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Session ID
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        First Page
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Last Page
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Events
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Duration
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Last Event
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
                  <EmptyState>No sessions to show yet.</EmptyState>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">UX Signals V1</h2>
            <p className="mt-1 text-sm text-slate-500">
              Friction signals calculated from existing interaction events
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total UX Signals"
              value={uxSignalsSummary.total_signals.toLocaleString()}
              detail="All detected friction signals"
              accent="sky"
            />
            <MetricCard
              label="Rage Clicks"
              value={uxSignalsSummary.total_rage_clicks.toLocaleString()}
              detail="Rapid repeated click groups"
              accent="amber"
            />
            <MetricCard
              label="Dead Clicks"
              value={uxSignalsSummary.total_dead_clicks.toLocaleString()}
              detail="Clicks without detected response"
              accent="violet"
            />
            <MetricCard
              label="Top Dead Page"
              value={displayPage(topDeadPage?.[0])}
              detail={topDeadPage ? `${topDeadPage[1]} detected signals` : "No dead clicks detected"}
              accent="emerald"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Rage Clicks by Page</h3>
              <p className="mt-1 text-sm text-slate-500">Pages ranked by detected rage click groups</p>

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
                  <EmptyState>No rage click pages detected.</EmptyState>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Rage Clicks by Element</h3>
              <p className="mt-1 text-sm text-slate-500">Elements and coordinate zones causing friction</p>

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
                  <EmptyState>No rage click elements detected.</EmptyState>
                )}
              </div>
            </article>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Dead Clicks by Page</h3>
              <p className="mt-1 text-sm text-slate-500">
                Pages ranked by clicks without detected response
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
                  <EmptyState>No dead click pages detected.</EmptyState>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Dead Clicks by Element</h3>
              <p className="mt-1 text-sm text-slate-500">
                Elements and coordinate zones that may not respond
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
                  <EmptyState>No dead click elements detected.</EmptyState>
                )}
              </div>
            </article>
          </div>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Detected Rage Clicks</h3>
              <p className="mt-1 text-sm text-slate-500">
                Latest {rageClicks.length} signals visible to the current token
              </p>
            </div>

            <div className="overflow-x-auto">
              {rageClicks.length ? (
                <table className="min-w-[980px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Page Path
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Element
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Session ID
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Clicks
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Severity
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Time
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
                            {signal.severity}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          <p>{formatDate(signal.last_click_at)}</p>
                          <p className="mt-0.5 text-xs">{signal.duration_ms} ms burst</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5">
                  <EmptyState>No rage clicks detected in the current analytics scope.</EmptyState>
                </div>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Detected Dead Clicks</h3>
              <p className="mt-1 text-sm text-slate-500">
                Latest {deadClicks.length} signals visible to the current token
              </p>
            </div>

            <div className="overflow-x-auto">
              {deadClicks.length ? (
                <table className="min-w-[900px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Page Path
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Element
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Session ID
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Severity
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Clicked At
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
                            {signal.severity}
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
                  <EmptyState>No dead clicks detected in the current analytics scope.</EmptyState>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Click Heatmap V1</h2>
              <p className="mt-1 text-sm text-slate-500">
                Normalized click positions from captured browser viewports
              </p>
            </div>

            <label className="w-full sm:w-72">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Preview page
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
                  <option value="">No click pages</option>
                )}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Heatmap Clicks"
              value={clickHeatmap.total_clicks.toLocaleString()}
              detail="Clicks with valid coordinates"
              accent="sky"
            />
            <MetricCard
              label="Pages"
              value={heatmapPages.length.toLocaleString()}
              detail="Pages with heatmap data"
              accent="emerald"
            />
            <MetricCard
              label="Elements"
              value={heatmapElements.length.toLocaleString()}
              detail="Elements or coordinate zones"
              accent="amber"
            />
            <MetricCard
              label="Loaded Points"
              value={clickHeatmap.points.length.toLocaleString()}
              detail="Up to 1,000 recent points"
              accent="violet"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clicks by Page</h3>
              <p className="mt-1 text-sm text-slate-500">Pages ranked by valid click coordinates</p>

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
                  <EmptyState>No pages with heatmap clicks.</EmptyState>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold">Clicks by Element</h3>
              <p className="mt-1 text-sm text-slate-500">Elements ranked by valid click coordinates</p>

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
                  <EmptyState>No elements with heatmap clicks.</EmptyState>
                )}
              </div>
            </article>
          </div>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-1 border-b border-slate-200 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
              <div>
                <h3 className="text-base font-semibold">Heatmap Preview</h3>
                <p className="mt-1 truncate text-sm text-slate-500" title={displayPage(activeHeatmapPage)}>
                  {displayPage(activeHeatmapPage)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-slate-600">
                {heatmapPreviewPoints.length.toLocaleString()} points
              </p>
            </div>

            <div className="p-4 sm:p-5">
              {heatmapPreviewPoints.length ? (
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
                  {heatmapPreviewPoints.map((point) => (
                    <span
                      key={point.event_id}
                      className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-700/50 bg-rose-500/60 shadow-sm"
                      style={{
                        left: `${point.x_percent}%`,
                        top: `${point.y_percent}%`,
                      }}
                      title={`${displayElementRanking(point.element_id || "coordinate_zone")} at ${point.x_percent}%, ${point.y_percent}%`}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState>No click points available for this page.</EmptyState>
              )}
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4 sm:p-5">
              <h3 className="text-base font-semibold">Recent Heatmap Points</h3>
              <p className="mt-1 text-sm text-slate-500">
                Latest {clickHeatmap.points.length} points visible to the current token
              </p>
            </div>

            <div className="overflow-x-auto">
              {clickHeatmap.points.length ? (
                <table className="min-w-[980px] w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Page Path</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Element</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Coordinates</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Viewport</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Session ID</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Occurred At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clickHeatmap.points.map((point) => (
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
                          {point.viewport_width} x {point.viewport_height}
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
                  <EmptyState>No valid click coordinates in the current analytics scope.</EmptyState>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Funnels V1</h2>
              <p className="mt-1 text-sm text-slate-500">
                Ordered conversion across sessions using existing events
              </p>
            </div>
            <button
              type="button"
              onClick={() => void analyzeDefaultFunnel()}
              disabled={!savedToken || isAnalyzingFunnel}
              className="h-10 self-start rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
            >
              {isAnalyzingFunnel ? "Analyzing..." : "Analyze funnel"}
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
                      Step {index + 1}
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Sessions</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
                  {funnelResult ? funnelResult.total_sessions.toLocaleString() : "--"}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Overall Conversion
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
                  {funnelResult ? `${funnelResult.overall_conversion_rate.toFixed(2)}%` : "--"}
                </p>
              </div>
              <div className="p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overall Dropoff</p>
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
                        Step
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Condition
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Sessions
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        From Previous
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        From Start
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Dropoff
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
                Analyze the predefined funnel to calculate conversion from your current analytics scope.
              </div>
            )}
          </article>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Recent Events</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Showing {filteredEvents.length} of {events.length} loaded events
                </p>
              </div>
              <button
                type="button"
                onClick={clearFilters}
                disabled={!filtersActive}
                className="h-9 self-start rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
              >
                Clear filters
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Event type
                </span>
                <select
                  value={eventTypeFilter}
                  onChange={(event) => setEventTypeFilter(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">All event types</option>
                  {eventTypeOptions.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {eventType}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Page path
                </span>
                <select
                  value={pagePathFilter}
                  onChange={(event) => setPagePathFilter(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">All pages</option>
                  {pagePathOptions.map((pagePath) => (
                    <option key={pagePath} value={pagePath}>
                      {pagePath}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Search
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Type, page, element, session..."
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
                      Event Type
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Page Path
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Element
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Session ID
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Created At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEvents.map((event) => {
                    const page = displayPage(event.page_path || event.page_url);
                    const element = event.element_text || event.element_id || "No element";

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
                    ? "No recent events match the current filters."
                    : "No recent events to show yet."}
                </EmptyState>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
