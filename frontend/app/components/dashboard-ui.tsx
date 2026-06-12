"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type DashboardZone =
  | "overview"
  | "behavior"
  | "conversion"
  | "friction"
  | "heatmaps"
  | "forms"
  | "intelligence";

export type ZoneTone =
  | "blue"
  | "cyan"
  | "green"
  | "orange"
  | "pink"
  | "amber"
  | "indigo";

export type ZoneItem = {
  id: DashboardZone;
  label: string;
  marker: string;
  metric: string;
  subtitle: string;
  tone: ZoneTone;
};

const toneStyles: Record<
  ZoneTone,
  {
    active: string;
    marker: string;
    metric: string;
    border: string;
  }
> = {
  blue: {
    active: "border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-100",
    marker: "bg-blue-600 text-white",
    metric: "text-blue-700",
    border: "hover:border-blue-200",
  },
  cyan: {
    active: "border-cyan-300 bg-cyan-50 shadow-sm ring-1 ring-cyan-100",
    marker: "bg-cyan-600 text-white",
    metric: "text-cyan-700",
    border: "hover:border-cyan-200",
  },
  green: {
    active: "border-emerald-300 bg-emerald-50 shadow-sm ring-1 ring-emerald-100",
    marker: "bg-emerald-600 text-white",
    metric: "text-emerald-700",
    border: "hover:border-emerald-200",
  },
  orange: {
    active: "border-orange-300 bg-orange-50 shadow-sm ring-1 ring-orange-100",
    marker: "bg-orange-600 text-white",
    metric: "text-orange-700",
    border: "hover:border-orange-200",
  },
  pink: {
    active: "border-fuchsia-300 bg-fuchsia-50 shadow-sm ring-1 ring-fuchsia-100",
    marker: "bg-fuchsia-600 text-white",
    metric: "text-fuchsia-700",
    border: "hover:border-fuchsia-200",
  },
  amber: {
    active: "border-amber-300 bg-amber-50 shadow-sm ring-1 ring-amber-100",
    marker: "bg-amber-500 text-white",
    metric: "text-amber-700",
    border: "hover:border-amber-200",
  },
  indigo: {
    active: "border-indigo-300 bg-indigo-50 shadow-sm ring-1 ring-indigo-100",
    marker: "bg-indigo-600 text-white",
    metric: "text-indigo-700",
    border: "hover:border-indigo-200",
  },
};

function SidebarContent({
  zones,
  activeZone,
  onChange,
  collapsed,
  onToggleCollapsed,
  onCloseMobile,
}: {
  zones: ZoneItem[];
  activeZone: DashboardZone;
  onChange: (zone: DashboardZone) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-3">
        <div className={`flex min-w-0 items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 font-mono text-xs font-bold text-white">
            UX
          </span>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">UXPulse</p>
              <p className="truncate text-[10px] text-slate-500">Command Center</p>
            </div>
          ) : null}
        </div>
        {onCloseMobile ? (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar navegación"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            ×
          </button>
        ) : null}
      </div>

      <nav aria-label="Módulos del dashboard" className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {zones.map((zone) => {
          const styles = toneStyles[zone.tone];
          const active = activeZone === zone.id;

          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onChange(zone.id)}
              aria-current={active ? "page" : undefined}
              aria-label={`Abrir ${zone.label}`}
              title={collapsed ? `${zone.label}: ${zone.subtitle}` : undefined}
              className={`group flex h-12 w-full items-center rounded-lg border text-left transition duration-200 ${
                collapsed ? "justify-center px-2" : "gap-3 px-2.5"
              } ${
                active
                  ? styles.active
                  : `border-transparent text-slate-600 ${styles.border} hover:bg-slate-50`
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-sm font-bold ${styles.marker}`}
              >
                {zone.marker}
              </span>
              {!collapsed ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {zone.label}
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] text-slate-500">
                      {zone.subtitle}
                    </span>
                    <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${styles.metric}`}>
                      {zone.metric}
                    </span>
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {!onCloseMobile ? (
        <div className="border-t border-slate-200 p-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            title={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            className={`flex h-10 w-full items-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 ${
              collapsed ? "justify-center" : "gap-3 px-3"
            }`}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {collapsed ? "›" : "‹"}
            </span>
            {!collapsed ? <span>Colapsar</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SidebarNavigation({
  zones,
  activeZone,
  onChange,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  zones: ZoneItem[];
  activeZone: DashboardZone;
  onChange: (zone: DashboardZone) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseMobile();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white shadow-sm transition-[width] duration-200 md:block ${
          collapsed ? "w-[72px]" : "w-[220px]"
        }`}
      >
        <SidebarContent
          zones={zones}
          activeZone={activeZone}
          onChange={onChange}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
        />
      </aside>

      <div
        className={`fixed inset-0 z-50 transition md:hidden ${
          mobileOpen ? "pointer-events-auto visible" : "pointer-events-none invisible"
        }`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Cerrar navegación"
          onClick={onCloseMobile}
          className={`absolute inset-0 bg-slate-950/35 transition-opacity ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-[min(84vw,300px)] border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarContent
            zones={zones}
            activeZone={activeZone}
            onChange={onChange}
            collapsed={false}
            onToggleCollapsed={onToggleCollapsed}
            onCloseMobile={onCloseMobile}
          />
        </aside>
      </div>
    </>
  );
}

export function ContextDrawer({
  open,
  title,
  eyebrow,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "Tab" && drawerRef.current) {
        const focusableElements = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) {
          return;
        }

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose, open]);

  return (
    <div
      className={`fixed inset-0 z-[70] transition ${
        open ? "pointer-events-auto visible" : "pointer-events-none invisible"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Cerrar detalle"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/30 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-drawer-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[410px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
                {eyebrow}
              </p>
            ) : null}
            <h2 id="context-drawer-title" className="mt-1 text-lg font-semibold text-slate-950">
              {title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

export function CommandMetric({
  label,
  value,
  detail,
  tone,
  marker,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string;
  tone: ZoneTone;
  marker?: string;
  emphasis?: boolean;
}) {
  const styles = toneStyles[tone];

  return (
    <article
      className={`relative overflow-hidden rounded-lg border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        emphasis ? "border-slate-300 sm:col-span-2 xl:col-span-1" : "border-slate-200"
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${styles.marker.split(" ")[0]}`} />
      <div className="flex items-center justify-between gap-3 pl-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        {marker ? (
          <span
            aria-hidden="true"
            className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-mono text-[10px] font-bold ${styles.marker}`}
          >
            {marker}
          </span>
        ) : null}
      </div>
      <p className={`mt-2 pl-1 text-2xl font-semibold tabular-nums ${styles.metric}`}>
        {value}
      </p>
      <p
        className="mt-1 min-h-8 overflow-hidden pl-1 text-xs leading-4 text-slate-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
        title={detail}
      >
        {detail}
      </p>
    </article>
  );
}

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          {description ? (
            <p className="mt-0.5 truncate text-xs text-slate-500" title={description}>
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}

export function ZoneHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">{title}</h2>
      </div>
      <p className="max-w-2xl text-sm text-slate-500 sm:text-right">
        {description}
      </p>
    </div>
  );
}
