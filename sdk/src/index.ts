export type UXPulseConfig = {
  apiKey: string;
  endpoint: string;
  autoTrackPageView?: boolean;
  autoTrackClicks?: boolean;
  autoTrackScroll?: boolean;
  autoTrackForms?: boolean;
};

export type TrackData = {
  page_url?: string | undefined;
  page_path?: string | undefined;
  element_id?: string | null | undefined;
  element_text?: string | null | undefined;
  element_tag?: string | null | undefined;
  x?: number | null | undefined;
  y?: number | null | undefined;
  scroll_x?: number | null | undefined;
  scroll_y?: number | null | undefined;
  document_width?: number | null | undefined;
  document_height?: number | null | undefined;
  viewport_width?: number | null | undefined;
  viewport_height?: number | null | undefined;
  user_agent?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
};

type EventPayload = TrackData & {
  session_id: string;
  anonymous_user_id: string;
  event_type: string;
  occurred_at: string;
};

type FormAbandonReason =
  | "page_unload"
  | "route_change"
  | "visibility_hidden"
  | "unknown";

type SafeFieldMetadata = {
  field_id?: string;
  field_name?: string;
  field_type: string;
  field_index: number;
  field_required: boolean;
};

type FormTrackingState = {
  started: boolean;
  submitted: boolean;
  abandoned: boolean;
  touchedFields: Set<string>;
  focusedAt: WeakMap<Element, number>;
  lastField: SafeFieldMetadata | null;
};

const SESSION_STORAGE_KEY = "uxpulse_session_id";
const ANONYMOUS_USER_STORAGE_KEY = "uxpulse_anonymous_user_id";
const MAX_TEXT_LENGTH = 300;
const SCROLL_MILESTONES = [25, 50, 75, 100];

let currentConfig: UXPulseConfig | null = null;
let clickListenerAttached = false;
let scrollListenerAttached = false;
let formListenerAttached = false;
let historyListenerAttached = false;
let pageViewTracked = false;
let maxScrollDepth = 0;
let lastScrollMilestone = 0;
let scrollTimeoutId: number | null = null;
let trackedPagePath = "";
const formStates = new Map<HTMLFormElement, FormTrackingState>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

function getConfig(): UXPulseConfig | null {
  if (!currentConfig) {
    warn("UXPulse SDK is not initialized. Call init({ apiKey, endpoint }) first.");
    return null;
  }

  return currentConfig;
}

function warn(message: string, error?: unknown): void {
  if (typeof console === "undefined") {
    return;
  }

  if (error) {
    console.warn(message, error);
    return;
  }

  console.warn(message);
}

function generateId(prefix: string): string {
  const cryptoObject = isBrowser() ? window.crypto : undefined;

  if (cryptoObject?.randomUUID) {
    return `${prefix}_${cryptoObject.randomUUID()}`;
  }

  const randomPart = Math.random().toString(36).slice(2);
  const timestamp = Date.now().toString(36);
  return `${prefix}_${timestamp}_${randomPart}`;
}

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch (error) {
    warn(`UXPulse could not read ${key} from storage.`, error);
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch (error) {
    warn(`UXPulse could not write ${key} to storage.`, error);
  }
}

function getOrCreateSessionId(): string {
  if (!isBrowser()) {
    return generateId("session");
  }

  const existingSessionId = readStorage(window.sessionStorage, SESSION_STORAGE_KEY);
  if (existingSessionId) {
    return existingSessionId;
  }

  const sessionId = generateId("session");
  writeStorage(window.sessionStorage, SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

function getOrCreateAnonymousUserId(): string {
  if (!isBrowser()) {
    return generateId("anon");
  }

  const existingUserId = readStorage(window.localStorage, ANONYMOUS_USER_STORAGE_KEY);
  if (existingUserId) {
    return existingUserId;
  }

  const anonymousUserId = generateId("anon");
  writeStorage(window.localStorage, ANONYMOUS_USER_STORAGE_KEY, anonymousUserId);
  return anonymousUserId;
}

function getPageData(): Pick<TrackData, "page_url" | "page_path"> {
  if (!isBrowser()) {
    return {};
  }

  return {
    page_url: window.location.href,
    page_path: window.location.pathname,
  };
}

function getViewportData(): Pick<TrackData, "viewport_width" | "viewport_height"> {
  if (!isBrowser()) {
    return {};
  }

  return {
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
  };
}

function getDocumentData(): Pick<
  TrackData,
  "scroll_x" | "scroll_y" | "document_width" | "document_height"
> {
  if (!isBrowser()) {
    return {};
  }

  const documentElement = document.documentElement;
  const body = document.body;

  return {
    scroll_x: window.scrollX || documentElement.scrollLeft || body.scrollLeft || 0,
    scroll_y: window.scrollY || documentElement.scrollTop || body.scrollTop || 0,
    document_width: Math.max(
      body.scrollWidth,
      body.offsetWidth,
      documentElement.clientWidth,
      documentElement.scrollWidth,
      documentElement.offsetWidth,
    ),
    document_height: Math.max(
      body.scrollHeight,
      body.offsetHeight,
      documentElement.clientHeight,
      documentElement.scrollHeight,
      documentElement.offsetHeight,
    ),
  };
}

function sanitizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, MAX_TEXT_LENGTH);
}

function hasSensitiveName(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return /(password|passwd|pwd|token|secret|authorization|auth[_-]?token|api[_-]?key|card|cc|cvv|cvc|ssn)/i.test(value);
}

function isFormControl(element: Element): boolean {
  return ["INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(element.tagName);
}

function isSensitiveElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const type = element.getAttribute("type");
  const name = element.getAttribute("name");
  const id = element.getAttribute("id");
  const autocomplete = element.getAttribute("autocomplete");
  const ariaLabel = element.getAttribute("aria-label");

  return (
    type === "password" ||
    hasSensitiveName(type) ||
    hasSensitiveName(name) ||
    hasSensitiveName(id) ||
    hasSensitiveName(autocomplete) ||
    hasSensitiveName(ariaLabel)
  );
}

function getSafeElementId(element: Element): string | null {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const explicitId = element.getAttribute("data-uxpulse-id") || element.id;
  if (!explicitId || hasSensitiveName(explicitId)) {
    return null;
  }

  return explicitId.slice(0, 200);
}

function getSafeElementText(element: Element): string | null {
  if (isSensitiveElement(element) || isFormControl(element)) {
    return null;
  }

  return sanitizeText(element.textContent);
}

function getTrackableElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest("button,a,[role='button'],input,textarea,select,label,[data-uxpulse-id]") || target;
}

function sanitizeStructuralIdentifier(
  value: string | null | undefined,
  maxLength = 160,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (
    !normalized
    || normalized.includes("@")
    || /\d{7,}/.test(normalized)
  ) {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}

function getFormActionPath(form: HTMLFormElement): string | undefined {
  const action = form.getAttribute("action");
  if (!action || action.startsWith("javascript:")) {
    return isBrowser() ? window.location.pathname : undefined;
  }

  try {
    return new URL(action, window.location.href).pathname;
  } catch {
    return window.location.pathname;
  }
}

function isTrackableFormField(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (
    !(element instanceof HTMLInputElement)
    && !(element instanceof HTMLTextAreaElement)
    && !(element instanceof HTMLSelectElement)
  ) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    return !["hidden", "submit", "button", "reset", "image"].includes(
      element.type.toLowerCase(),
    );
  }

  return true;
}

function getFormFields(
  form: HTMLFormElement,
): Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
  return Array.from(form.elements).filter(isTrackableFormField);
}

function getFieldType(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string {
  if (field instanceof HTMLInputElement) {
    return field.type.toLowerCase() || "text";
  }

  if (field instanceof HTMLSelectElement) {
    return field.multiple ? "select-multiple" : "select-one";
  }

  return "textarea";
}

function getSafeFieldMetadata(
  form: HTMLFormElement,
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): SafeFieldMetadata {
  const fields = getFormFields(form);
  const fieldType = getFieldType(field);
  const baseMetadata: SafeFieldMetadata = {
    field_type: fieldType,
    field_index: Math.max(0, fields.indexOf(field)),
    field_required: field.required,
  };

  if (fieldType === "password") {
    return baseMetadata;
  }

  const fieldId = sanitizeStructuralIdentifier(field.id, 200);
  const fieldName = sanitizeStructuralIdentifier(field.name, 200);

  return {
    ...baseMetadata,
    ...(fieldId ? { field_id: fieldId } : {}),
    ...(fieldName ? { field_name: fieldName } : {}),
  };
}

function getSafeFormMetadata(form: HTMLFormElement): Record<string, unknown> {
  const formId = sanitizeStructuralIdentifier(form.id, 200);
  const formName = sanitizeStructuralIdentifier(form.name, 200);
  const formIndex = Math.max(0, Array.from(document.forms).indexOf(form));

  return {
    ...(formId ? { form_id: formId } : {}),
    ...(formName ? { form_name: formName } : {}),
    form_index: formIndex,
    form_action_path: getFormActionPath(form),
    page_path: window.location.pathname,
    total_fields_count: getFormFields(form).length,
  };
}

function getFormState(form: HTMLFormElement): FormTrackingState {
  const existingState = formStates.get(form);
  if (existingState) {
    return existingState;
  }

  const state: FormTrackingState = {
    started: false,
    submitted: false,
    abandoned: false,
    touchedFields: new Set<string>(),
    focusedAt: new WeakMap<Element, number>(),
    lastField: null,
  };
  formStates.set(form, state);
  return state;
}

function fieldTrackingKey(field: SafeFieldMetadata): string {
  return [
    field.field_id || "",
    field.field_name || "",
    field.field_type,
    String(field.field_index),
  ].join(":");
}

function formProgressMetadata(
  form: HTMLFormElement,
  state: FormTrackingState,
): Record<string, unknown> {
  return {
    ...getSafeFormMetadata(form),
    fields_touched_count: state.touchedFields.size,
    ...(state.lastField
      ? {
          last_field_id: state.lastField.field_id,
          last_field_name: state.lastField.field_name,
          last_field_type: state.lastField.field_type,
          last_field_index: state.lastField.field_index,
        }
      : {}),
  };
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item));
  }

  if (value && typeof value === "object") {
    const cleaned: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (hasSensitiveName(key)) {
        continue;
      }

      cleaned[key] = sanitizeMetadataValue(nestedValue);
    }

    return cleaned;
  }

  return value;
}

function sanitizeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  return sanitizeMetadataValue(metadata) as Record<string, unknown>;
}

async function sendEvent(eventType: string, data: TrackData = {}): Promise<void> {
  const config = getConfig();
  if (!config || !isBrowser()) {
    return;
  }

  const payload: EventPayload = {
    session_id: getOrCreateSessionId(),
    anonymous_user_id: getOrCreateAnonymousUserId(),
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    page_url: data.page_url,
    page_path: data.page_path,
    element_id: data.element_id,
    element_text: data.element_text ? data.element_text.slice(0, MAX_TEXT_LENGTH) : data.element_text,
    element_tag: data.element_tag,
    x: data.x,
    y: data.y,
    scroll_x: data.scroll_x,
    scroll_y: data.scroll_y,
    document_width: data.document_width,
    document_height: data.document_height,
    viewport_width: data.viewport_width,
    viewport_height: data.viewport_height,
    user_agent: data.user_agent ?? window.navigator.userAgent,
    metadata: sanitizeMetadata(data.metadata),
  };

  try {
    const response = await fetch(`${normalizeEndpoint(config.endpoint)}/v1/events`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      warn(`UXPulse event tracking returned HTTP ${response.status}. ${responseText}`);
    }
  } catch (error) {
    warn("UXPulse event tracking failed.", error);
  }
}

function calculateScrollDepth(): number {
  if (!isBrowser()) {
    return 0;
  }

  const documentElement = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY || documentElement.scrollTop || body.scrollTop || 0;
  const scrollHeight = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    documentElement.clientHeight,
    documentElement.scrollHeight,
    documentElement.offsetHeight,
  );
  const viewportHeight = window.innerHeight || documentElement.clientHeight;
  const scrollableHeight = Math.max(scrollHeight - viewportHeight, 1);
  const depth = Math.round(((scrollTop + viewportHeight) / scrollHeight) * 100);

  if (scrollableHeight <= 1) {
    return 100;
  }

  return Math.max(0, Math.min(100, depth));
}

function attachClickTracking(): void {
  if (!isBrowser() || clickListenerAttached) {
    return;
  }

  document.addEventListener("click", handleDocumentClick, true);
  clickListenerAttached = true;
}

function attachScrollTracking(): void {
  if (!isBrowser() || scrollListenerAttached) {
    return;
  }

  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  scrollListenerAttached = true;
}

async function ensureFormStarted(
  form: HTMLFormElement,
  state: FormTrackingState,
): Promise<void> {
  if (state.started) {
    return;
  }

  state.started = true;
  await sendEvent("form_start", {
    ...getPageData(),
    ...getViewportData(),
    metadata: getSafeFormMetadata(form),
  });
}

async function handleFormFocus(event: FocusEvent): Promise<void> {
  if (!(event.target instanceof Element) || !isTrackableFormField(event.target)) {
    return;
  }

  const field = event.target;
  const form = field.form;
  if (!form) {
    return;
  }

  const state = getFormState(form);
  await ensureFormStarted(form, state);

  const fieldMetadata = getSafeFieldMetadata(form, field);
  state.touchedFields.add(fieldTrackingKey(fieldMetadata));
  state.lastField = fieldMetadata;
  state.focusedAt.set(field, performance.now());

  await sendEvent("form_field_focus", {
    ...getPageData(),
    ...getViewportData(),
    metadata: {
      ...getSafeFormMetadata(form),
      ...fieldMetadata,
      fields_touched_count: state.touchedFields.size,
    },
  });
}

async function handleFormBlur(event: FocusEvent): Promise<void> {
  if (!(event.target instanceof Element) || !isTrackableFormField(event.target)) {
    return;
  }

  const field = event.target;
  const form = field.form;
  if (!form) {
    return;
  }

  const state = getFormState(form);
  if (!state.started) {
    return;
  }

  const fieldMetadata = getSafeFieldMetadata(form, field);
  const focusedAt = state.focusedAt.get(field);
  const timeOnFieldMs =
    focusedAt === undefined
      ? undefined
      : Math.max(0, Math.round(performance.now() - focusedAt));

  state.lastField = fieldMetadata;
  state.focusedAt.delete(field);

  await sendEvent("form_field_blur", {
    ...getPageData(),
    ...getViewportData(),
    metadata: {
      ...getSafeFormMetadata(form),
      ...fieldMetadata,
      fields_touched_count: state.touchedFields.size,
      ...(timeOnFieldMs !== undefined
        ? { time_on_field_ms: timeOnFieldMs }
        : {}),
    },
  });
}

async function handleFormSubmit(event: SubmitEvent): Promise<void> {
  if (!(event.target instanceof HTMLFormElement)) {
    return;
  }

  const form = event.target;
  const state = getFormState(form);
  await ensureFormStarted(form, state);
  state.submitted = true;

  await sendEvent("form_submit", {
    ...getPageData(),
    ...getViewportData(),
    metadata: formProgressMetadata(form, state),
  });
}

function abandonActiveForms(reason: FormAbandonReason): void {
  for (const [form, state] of formStates.entries()) {
    if (!state.started || state.submitted || state.abandoned) {
      continue;
    }

    state.abandoned = true;
    void sendEvent("form_abandon", {
      page_url: window.location.href,
      page_path: trackedPagePath || window.location.pathname,
      ...getViewportData(),
      metadata: {
        ...formProgressMetadata(form, state),
        page_path: trackedPagePath || window.location.pathname,
        abandon_reason: reason,
      },
    });
  }
}

function handleFormPageHide(): void {
  abandonActiveForms("page_unload");
}

function handleFormVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    abandonActiveForms("visibility_hidden");
  }
}

function handleFormRouteChange(): void {
  const nextPath = window.location.pathname;
  if (nextPath === trackedPagePath) {
    return;
  }

  abandonActiveForms("route_change");
  formStates.clear();
  trackedPagePath = nextPath;
}

function patchHistoryForFormTracking(): void {
  if (historyListenerAttached) {
    return;
  }

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  window.history.pushState = function pushState(...args): void {
    abandonActiveForms("route_change");
    formStates.clear();
    originalPushState.apply(this, args);
    trackedPagePath = window.location.pathname;
  };

  window.history.replaceState = function replaceState(...args): void {
    abandonActiveForms("route_change");
    formStates.clear();
    originalReplaceState.apply(this, args);
    trackedPagePath = window.location.pathname;
  };

  window.addEventListener("popstate", handleFormRouteChange);
  historyListenerAttached = true;
}

function attachFormTracking(): void {
  if (!isBrowser() || formListenerAttached) {
    return;
  }

  trackedPagePath = window.location.pathname;
  document.addEventListener(
    "focusin",
    (event) => void handleFormFocus(event),
    true,
  );
  document.addEventListener(
    "focusout",
    (event) => void handleFormBlur(event),
    true,
  );
  document.addEventListener(
    "submit",
    (event) => void handleFormSubmit(event),
    true,
  );
  window.addEventListener("pagehide", handleFormPageHide);
  document.addEventListener(
    "visibilitychange",
    handleFormVisibilityChange,
  );
  patchHistoryForFormTracking();
  formListenerAttached = true;
}

function handleDocumentClick(event: MouseEvent): void {
  void trackClick(event);
}

function handleScroll(): void {
  if (scrollTimeoutId !== null) {
    window.clearTimeout(scrollTimeoutId);
  }

  scrollTimeoutId = window.setTimeout(() => {
    void trackAutoScrollDepth();
  }, 250);
}

function handlePageHide(): void {
  void trackScrollDepth();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    void trackScrollDepth();
  }
}

async function trackAutoScrollDepth(): Promise<void> {
  const currentDepth = calculateScrollDepth();
  maxScrollDepth = Math.max(maxScrollDepth, currentDepth);

  const nextMilestone = SCROLL_MILESTONES.find(
    (milestone) => maxScrollDepth >= milestone && lastScrollMilestone < milestone,
  );

  if (!nextMilestone) {
    return;
  }

  lastScrollMilestone = nextMilestone;

  await sendEvent("scroll_depth", {
    ...getPageData(),
    ...getViewportData(),
    metadata: {
      max_scroll_depth: maxScrollDepth,
    },
  });
}

export function init(config: UXPulseConfig): void {
  currentConfig = {
    ...config,
    endpoint: normalizeEndpoint(config.endpoint),
  };

  if (!isBrowser()) {
    return;
  }

  getOrCreateSessionId();
  getOrCreateAnonymousUserId();

  if (config.autoTrackPageView && !pageViewTracked) {
    pageViewTracked = true;
    void trackPageView();
  }

  if (config.autoTrackClicks) {
    attachClickTracking();
  }

  if (config.autoTrackScroll) {
    attachScrollTracking();
  }

  if (config.autoTrackForms !== false) {
    attachFormTracking();
  }
}

export async function track(eventType: string, data: TrackData = {}): Promise<void> {
  await sendEvent(eventType, {
    ...getPageData(),
    ...getViewportData(),
    ...data,
  });
}

export async function trackPageView(): Promise<void> {
  await sendEvent("page_view", {
    ...getPageData(),
    ...getViewportData(),
  });
}

export async function trackClick(event: MouseEvent): Promise<void> {
  const element = getTrackableElement(event.target);
  if (!element || isSensitiveElement(element)) {
    return;
  }

  await sendEvent("click", {
    ...getPageData(),
    ...getViewportData(),
    ...getDocumentData(),
    element_id: getSafeElementId(element),
    element_text: getSafeElementText(element),
    element_tag: element.tagName.toLowerCase(),
    x: event.clientX,
    y: event.clientY,
  });
}

export async function trackScrollDepth(): Promise<void> {
  const currentDepth = calculateScrollDepth();
  maxScrollDepth = Math.max(maxScrollDepth, currentDepth);

  await sendEvent("scroll_depth", {
    ...getPageData(),
    ...getViewportData(),
    metadata: {
      max_scroll_depth: maxScrollDepth,
    },
  });
}

const UXPulse = {
  init,
  track,
  trackPageView,
  trackClick,
  trackScrollDepth,
};

export default UXPulse;
