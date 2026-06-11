import hashlib
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.db_models import Event
from app.schemas import FunnelStepInput
from app.services.form_analytics_service import (
    get_form_abandonment,
    get_form_fields,
)
from app.services.funnel_service import analyze_funnel
from app.services.heatmap_service import get_click_heatmap
from app.services.ux_signal_service import (
    load_dead_click_signals,
    load_rage_click_signals,
)


Severity = Literal["low", "medium", "high"]
Insight = dict[str, Any]

LOW_DATA_EVENT_THRESHOLD = 30
DEFAULT_FUNNEL_STEPS = [
    FunnelStepInput(event_type="page_view"),
    FunnelStepInput(event_type="click"),
    FunnelStepInput(event_type="custom_event"),
]
SEVERITY_ORDER = {"high": 3, "medium": 2, "low": 1}


def confidence_for_sample(
    sample_size: int,
    *,
    reliable_sample: int,
    minimum: float = 0.35,
) -> float:
    if sample_size <= 0:
        return minimum

    progress = min(1.0, sample_size / reliable_sample)
    return round(min(0.95, minimum + progress * (0.95 - minimum)), 2)


def insight_id(
    issue_type: str,
    page_path: str | None,
    element: str | None,
    metric: str,
) -> str:
    identity = "|".join(
        (issue_type, page_path or "", element or "", metric)
    )
    digest = hashlib.sha1(identity.encode("utf-8")).hexdigest()[:12]
    return f"UXI-{digest.upper()}"


def create_insight(
    *,
    issue_type: str,
    severity: Severity,
    title: str,
    description: str,
    recommendation: str,
    page_path: str | None,
    element: str | None,
    metric: str,
    value: float,
    evidence: list[str],
    confidence: float,
) -> Insight:
    return {
        "id": insight_id(issue_type, page_path, element, metric),
        "type": issue_type,
        "severity": severity,
        "title": title,
        "description": description,
        "recommendation": recommendation,
        "page_path": page_path,
        "element": element,
        "metric": metric,
        "value": round(float(value), 2),
        "evidence": evidence,
        "confidence": round(min(1.0, max(0.0, confidence)), 2),
    }


def severity_for_count(
    count: int,
    *,
    medium_threshold: int,
    high_threshold: int,
) -> Severity:
    if count >= high_threshold:
        return "high"

    if count >= medium_threshold:
        return "medium"

    return "low"


def group_signals(signals: list[Insight]) -> Counter[tuple[str, str]]:
    return Counter(
        (
            signal.get("page_path") or "unknown",
            signal.get("element_id") or "coordinate_zone",
        )
        for signal in signals
    )


def dead_click_insights(signals: list[Insight]) -> list[Insight]:
    insights = []

    for (page_path, element), count in group_signals(signals).items():
        if count < 2:
            continue

        severity = severity_for_count(
            count,
            medium_threshold=3,
            high_threshold=5,
        )
        insights.append(
            create_insight(
                issue_type="dead_click_issue",
                severity=severity,
                title="Elemento con clics sin respuesta",
                description=(
                    "Se detectaron clics repetidos sin una respuesta posterior "
                    "observable en el mismo flujo."
                ),
                recommendation=(
                    "Revisa si el elemento parece clickeable pero no responde, "
                    "tiene un área activa incorrecta o necesita feedback visual."
                ),
                page_path=page_path,
                element=element,
                metric="dead_clicks",
                value=count,
                evidence=[
                    f"{count} clics sin respuesta detectados.",
                    f"Elemento observado: {element}.",
                ],
                confidence=confidence_for_sample(
                    count,
                    reliable_sample=10,
                ),
            )
        )

    return insights


def rage_click_insights(signals: list[Insight]) -> list[Insight]:
    insights = []

    for (page_path, element), count in group_signals(signals).items():
        severity = severity_for_count(
            count,
            medium_threshold=2,
            high_threshold=3,
        )
        total_clicks = sum(
            signal.get("clicks_count", 0)
            for signal in signals
            if (signal.get("page_path") or "unknown") == page_path
            and (signal.get("element_id") or "coordinate_zone") == element
        )
        insights.append(
            create_insight(
                issue_type="rage_click_issue",
                severity=severity,
                title="Patrón de clics de frustración",
                description=(
                    "Varias secuencias de clics rápidos se concentraron en el "
                    "mismo objetivo."
                ),
                recommendation=(
                    "Revisa errores visuales, latencia, estados de carga y si "
                    "la acción confirma claramente que fue recibida."
                ),
                page_path=page_path,
                element=element,
                metric="rage_click_groups",
                value=count,
                evidence=[
                    f"{count} grupos de rage clicks detectados.",
                    f"{total_clicks} clics participaron en esos grupos.",
                ],
                confidence=confidence_for_sample(
                    total_clicks,
                    reliable_sample=18,
                ),
            )
        )

    return insights


def form_abandonment_insights(forms: list[Insight]) -> list[Insight]:
    insights = []

    for form in forms:
        starts = form["starts"]
        abandons = form["abandons"]
        abandon_rate = form["abandon_rate"]

        if starts < 3 or abandons < 2 or abandon_rate < 50:
            continue

        if abandon_rate >= 75 and abandons >= 4:
            severity: Severity = "high"
        elif abandon_rate >= 60 or abandons >= 3:
            severity = "medium"
        else:
            severity = "low"

        form_label = (
            form["form_id"]
            or form["form_name"]
            or (
                f"form_index:{form['form_index']}"
                if form["form_index"] is not None
                else "unknown_form"
            )
        )
        evidence = [
            f"{abandons} abandonos en {starts} inicios.",
            f"Tasa de abandono: {abandon_rate:.2f}%.",
        ]
        if form["most_common_last_field"]:
            evidence.append(
                "Último campo más frecuente: "
                f"{form['most_common_last_field']}."
            )

        insights.append(
            create_insight(
                issue_type="form_abandonment_issue",
                severity=severity,
                title="Alta tasa de abandono de formulario",
                description=(
                    "Una proporción relevante de usuarios inicia este "
                    "formulario pero no llega a enviarlo."
                ),
                recommendation=(
                    "Reduce campos innecesarios, aclara requisitos y revisa "
                    "los campos que aparecen antes del abandono."
                ),
                page_path=form["page_path"],
                element=form_label,
                metric="form_abandon_rate",
                value=abandon_rate,
                evidence=evidence,
                confidence=confidence_for_sample(
                    starts,
                    reliable_sample=20,
                ),
            )
        )

    return insights


def field_friction_insights(fields: list[Insight]) -> list[Insight]:
    insights = []

    for field in fields:
        abandon_count = field["abandon_count_as_last_field"]
        if abandon_count < 2:
            continue

        severity = severity_for_count(
            abandon_count,
            medium_threshold=3,
            high_threshold=5,
        )
        field_label = (
            field["field_id"]
            or field["field_name"]
            or f"{field['field_type']}:{field['field_index']}"
        )

        insights.append(
            create_insight(
                issue_type="field_friction_issue",
                severity=severity,
                title="Campo asociado con abandono",
                description=(
                    "Este campo aparece repetidamente como la última "
                    "interacción antes de abandonar el formulario."
                ),
                recommendation=(
                    "Revisa si el campo es confuso, obligatorio sin necesidad, "
                    "demasiado sensible o presenta validaciones poco claras."
                ),
                page_path=field["page_path"],
                element=field_label,
                metric="last_field_abandonments",
                value=abandon_count,
                evidence=[
                    (
                        f"Fue el último campo antes del abandono "
                        f"{abandon_count} veces."
                    ),
                    (
                        f"Tiempo promedio observado: "
                        f"{field['average_time_on_field_ms']:.0f} ms."
                    ),
                ],
                confidence=confidence_for_sample(
                    max(abandon_count, field["focus_count"]),
                    reliable_sample=15,
                ),
            )
        )

    return insights


def funnel_dropoff_insights(funnel: Insight) -> list[Insight]:
    steps = funnel["steps"]
    if not steps or steps[0]["sessions_count"] < 5:
        return []

    insights = []
    for step in steps[1:]:
        dropoff = step["dropoff_from_previous"]
        if dropoff < 40:
            continue

        if dropoff >= 70:
            severity: Severity = "high"
        elif dropoff >= 55:
            severity = "medium"
        else:
            severity = "low"

        step_label = f"Paso {step['step_index']}: {step['event_type']}"
        insights.append(
            create_insight(
                issue_type="funnel_dropoff_issue",
                severity=severity,
                title="Caída relevante en el funnel base",
                description=(
                    "La conversión disminuye de forma visible antes de "
                    f"completar {step_label.lower()}."
                ),
                recommendation=(
                    "Simplifica el paso anterior, elimina fricción innecesaria "
                    "y valida que la siguiente acción sea clara y accesible."
                ),
                page_path=step["page_path"],
                element=step["element_id"],
                metric="dropoff_from_previous",
                value=dropoff,
                evidence=[
                    (
                        f"{step['sessions_count']} sesiones alcanzaron "
                        f"{step_label.lower()}."
                    ),
                    f"Abandono desde el paso anterior: {dropoff:.2f}%.",
                    "Funnel evaluado: page_view → click → custom_event.",
                ],
                confidence=confidence_for_sample(
                    steps[0]["sessions_count"],
                    reliable_sample=30,
                ),
            )
        )

    return insights


def scroll_depth_insights(document_points: list[Insight]) -> list[Insight]:
    points_by_page: dict[str, list[Insight]] = defaultdict(list)
    for point in document_points:
        if (
            point.get("viewport_height")
            and point.get("document_height")
            and point["document_height"] > point["viewport_height"]
            and point.get("normalized_document_y") is not None
        ):
            points_by_page[point.get("page_path") or "unknown"].append(point)

    insights = []
    for page_path, points in points_by_page.items():
        if len(points) < 8:
            continue

        below_fold = sum(
            point["absolute_y"] > point["viewport_height"]
            for point in points
        )
        below_fold_rate = below_fold / len(points) * 100
        deep_clicks = sum(
            point["normalized_document_y"] >= 0.75
            for point in points
        )
        deep_click_rate = deep_clicks / len(points) * 100

        if below_fold_rate <= 15:
            insights.append(
                create_insight(
                    issue_type="scroll_depth_issue",
                    severity="medium" if len(points) >= 20 else "low",
                    title="Poca interacción debajo del primer pliegue",
                    description=(
                        "La mayoría de los clics ocurre dentro del primer "
                        "viewport de una página con contenido adicional."
                    ),
                    recommendation=(
                        "Mueve el CTA o contenido prioritario más arriba y "
                        "refuerza las pistas visuales para continuar bajando."
                    ),
                    page_path=page_path,
                    element=None,
                    metric="below_fold_click_rate",
                    value=below_fold_rate,
                    evidence=[
                        f"{below_fold} de {len(points)} clics quedaron debajo del pliegue.",
                        f"Proporción debajo del pliegue: {below_fold_rate:.2f}%.",
                    ],
                    confidence=confidence_for_sample(
                        len(points),
                        reliable_sample=40,
                    ),
                )
            )
        elif deep_clicks >= 3 and deep_click_rate >= 40:
            insights.append(
                create_insight(
                    issue_type="scroll_depth_issue",
                    severity="medium",
                    title="Interacción importante muy abajo en la página",
                    description=(
                        "Una parte considerable de los clics se concentra en "
                        "el último cuarto del documento."
                    ),
                    recommendation=(
                        "Evalúa mover el CTA o contenido más utilizado a una "
                        "posición anterior de la página."
                    ),
                    page_path=page_path,
                    element=None,
                    metric="deep_page_click_rate",
                    value=deep_click_rate,
                    evidence=[
                        f"{deep_clicks} clics ocurrieron entre 75% y 100% de profundidad.",
                        f"Proporción en la zona profunda: {deep_click_rate:.2f}%.",
                    ],
                    confidence=confidence_for_sample(
                        len(points),
                        reliable_sample=40,
                    ),
                )
            )

    return insights


def point_segment_key(point: Insight) -> tuple[str, str, str]:
    return (
        point.get("session_id") or "",
        point.get("page_path") or "unknown",
        point.get("element_id") or "coordinate_zone",
    )


def device_segment_insights(
    signals: list[Insight],
    heatmap: Insight,
) -> list[Insight]:
    points = heatmap["points"]
    if not points or not signals:
        return []

    segments_by_target: dict[tuple[str, str, str], Counter[str]] = defaultdict(
        Counter
    )
    segments_by_session_page: dict[tuple[str, str], Counter[str]] = defaultdict(
        Counter
    )
    for point in points:
        segment = point["viewport_segment"]
        segments_by_target[point_segment_key(point)][segment] += 1
        segments_by_session_page[
            (
                point.get("session_id") or "",
                point.get("page_path") or "unknown",
            )
        ][segment] += 1

    friction_by_segment: Counter[str] = Counter()
    for signal in signals:
        key = (
            signal.get("session_id") or "",
            signal.get("page_path") or "unknown",
            signal.get("element_id") or "coordinate_zone",
        )
        candidates = segments_by_target.get(key)
        if not candidates:
            candidates = segments_by_session_page.get((key[0], key[1]))
        if candidates:
            friction_by_segment[candidates.most_common(1)[0][0]] += 1

    total_signals = sum(friction_by_segment.values())
    total_clicks = sum(heatmap["viewport_segments"].values())
    if total_signals < 4 or total_clicks <= 0:
        return []

    overall_rate = total_signals / total_clicks * 100
    candidates = []
    for segment, signal_count in friction_by_segment.items():
        click_count = heatmap["viewport_segments"].get(segment, 0)
        if segment == "unknown" or signal_count < 3 or click_count < 5:
            continue

        rate = signal_count / click_count * 100
        if rate >= 10 and rate >= overall_rate * 1.4:
            candidates.append((segment, signal_count, click_count, rate))

    if not candidates:
        return []

    segment, signal_count, click_count, rate = max(
        candidates,
        key=lambda item: (item[3], item[1]),
    )
    severity: Severity = "high" if signal_count >= 8 else "medium"

    return [
        create_insight(
            issue_type="device_segment_issue",
            severity=severity,
            title=f"Fricción concentrada en {segment}",
            description=(
                "Este segmento de viewport presenta una tasa de señales UX "
                "mayor que el promedio observado."
            ),
            recommendation=(
                "Revisa el responsive, tamaños de objetivos, estados de carga "
                "y distribución del layout en este segmento."
            ),
            page_path=None,
            element=segment,
            metric="ux_signal_rate_by_device",
            value=rate,
            evidence=[
                f"{signal_count} señales en {click_count} clics del segmento.",
                f"Tasa del segmento: {rate:.2f}%.",
                f"Tasa general observada: {overall_rate:.2f}%.",
            ],
            confidence=confidence_for_sample(
                click_count,
                reliable_sample=50,
            ),
        )
    ]


def low_data_insight(total_events: int) -> Insight | None:
    if total_events >= LOW_DATA_EVENT_THRESHOLD:
        return None

    return create_insight(
        issue_type="low_data_notice",
        severity="low",
        title="Datos insuficientes para conclusiones firmes",
        description=(
            "El volumen actual permite detectar señales iniciales, pero no "
            "sostiene conclusiones estadísticas fuertes."
        ),
        recommendation=(
            "Recolecta más eventos y sesiones antes de priorizar cambios de "
            "producto basados únicamente en estas recomendaciones."
        ),
        page_path=None,
        element=None,
        metric="total_events",
        value=total_events,
        evidence=[
            f"{total_events} eventos disponibles.",
            f"Umbral orientativo de análisis: {LOW_DATA_EVENT_THRESHOLD} eventos.",
        ],
        confidence=confidence_for_sample(
            total_events,
            reliable_sample=LOW_DATA_EVENT_THRESHOLD,
            minimum=0.25,
        ),
    )


def sort_insights(insights: list[Insight]) -> list[Insight]:
    return sorted(
        insights,
        key=lambda insight: (
            -SEVERITY_ORDER[insight["severity"]],
            -insight["confidence"],
            -insight["value"],
            insight["type"],
            insight["id"],
        ),
    )


def build_intelligence(
    db: Session,
    project_id: str | None = None,
) -> tuple[list[Insight], int]:
    event_query = db.query(Event)
    if project_id:
        event_query = event_query.filter(Event.project_id == project_id)
    total_events = event_query.count()

    rage_signals = load_rage_click_signals(db, project_id=project_id)
    dead_signals = load_dead_click_signals(db, project_id=project_id)
    forms = get_form_abandonment(db, project_id=project_id, limit=1000)
    fields = get_form_fields(db, project_id=project_id, limit=1000)
    heatmap = get_click_heatmap(
        db,
        project_id=project_id,
        limit=5000,
    )
    funnel = analyze_funnel(
        db,
        steps=DEFAULT_FUNNEL_STEPS,
        project_id=project_id,
    )

    insights = [
        *dead_click_insights(dead_signals),
        *rage_click_insights(rage_signals),
        *form_abandonment_insights(forms),
        *field_friction_insights(fields),
        *funnel_dropoff_insights(funnel),
        *scroll_depth_insights(heatmap["document_points"]),
        *device_segment_insights(
            [*dead_signals, *rage_signals],
            heatmap,
        ),
    ]
    notice = low_data_insight(total_events)
    if notice:
        insights.append(notice)

    return sort_insights(insights), total_events


def filter_intelligence(
    insights: list[Insight],
    *,
    page_path: str | None = None,
    severity: Severity | None = None,
    limit: int = 100,
) -> list[Insight]:
    filtered = [
        insight
        for insight in insights
        if (page_path is None or insight["page_path"] == page_path)
        and (severity is None or insight["severity"] == severity)
    ]
    return filtered[:limit]


def get_intelligence_issues(
    db: Session,
    *,
    project_id: str | None = None,
    page_path: str | None = None,
    severity: Severity | None = None,
    limit: int = 100,
) -> list[Insight]:
    insights, _ = build_intelligence(db, project_id=project_id)
    return filter_intelligence(
        insights,
        page_path=page_path,
        severity=severity,
        limit=limit,
    )


def get_intelligence_recommendations(
    db: Session,
    *,
    project_id: str | None = None,
    page_path: str | None = None,
    severity: Severity | None = None,
    limit: int = 100,
) -> list[Insight]:
    return get_intelligence_issues(
        db,
        project_id=project_id,
        page_path=page_path,
        severity=severity,
        limit=limit,
    )


def get_intelligence_summary(
    db: Session,
    project_id: str | None = None,
) -> Insight:
    insights, total_events = build_intelligence(db, project_id=project_id)
    severity_counts = Counter(
        insight["severity"]
        for insight in insights
    )
    issue_types = Counter(
        insight["type"]
        for insight in insights
        if insight["type"] != "low_data_notice"
    )
    problem_pages = Counter(
        insight["page_path"]
        for insight in insights
        if insight["page_path"]
        and insight["page_path"] != "unknown"
        and insight["type"] != "low_data_notice"
    )
    penalty = sum(
        {
            "high": 15,
            "medium": 8,
            "low": 3,
        }[insight["severity"]]
        for insight in insights
        if insight["type"] != "low_data_notice"
    )
    health_score = max(0, 100 - min(100, penalty))

    if total_events < LOW_DATA_EVENT_THRESHOLD:
        short_summary = (
            "Hay pocos datos. Las señales actuales son orientativas y deben "
            "confirmarse con más actividad."
        )
    elif not issue_types:
        short_summary = (
            "No se detectaron problemas relevantes con las reglas actuales."
        )
    else:
        short_summary = (
            f"Se detectaron {sum(issue_types.values())} señales accionables; "
            "prioriza las de severidad alta y mayor confianza."
        )

    return {
        "total_issues": len(insights),
        "high_severity_count": severity_counts["high"],
        "medium_severity_count": severity_counts["medium"],
        "low_severity_count": severity_counts["low"],
        "top_issue_type": (
            issue_types.most_common(1)[0][0]
            if issue_types
            else None
        ),
        "top_problem_page": (
            problem_pages.most_common(1)[0][0]
            if problem_pages
            else None
        ),
        "overall_health_score": health_score,
        "generated_at": datetime.now(timezone.utc),
        "short_summary": short_summary,
    }
