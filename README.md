# UXPulse Analytics

Plataforma autohospedada de analítica del comportamiento UX, construida con
FastAPI, PostgreSQL, Next.js y un SDK TypeScript para navegador.

## Qué problema resuelve

Saber cuántas visitas recibe una página no explica dónde se atascan sus usuarios.
UXPulse conecta eventos, sesiones, embudos y formularios para ayudar a equipos de
producto y desarrollo a identificar abandono, clics sin respuesta y fricción por
campo, manteniendo los datos en su propia infraestructura.

## Vista del producto

![Resumen de UXPulse](docs/screenshots/dashboard-overview.png)

Captura existente del repositorio. Los valores mostrados ilustran ese conjunto
de datos; no representan resultados comerciales ni una medición de producción.
Más abajo se incluyen capturas de los flujos específicos.

## Stack

| Capa | Tecnologías |
| --- | --- |
| Dashboard | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| API | Python 3.12, FastAPI, Pydantic |
| Persistencia | PostgreSQL 16, SQLAlchemy 2, psycopg, Alembic |
| Captura | SDK TypeScript para navegador |
| Desarrollo | Docker Compose para PostgreSQL, scripts de smoke tests |

## Características

- Event Tracking API con ingesta individual y por lotes.
- SDK TypeScript para navegador que captura vistas de página, clics,
  profundidad de desplazamiento, eventos personalizados y actividad
  estructural de formularios.
- Dashboard en Next.js con eventos, sesiones, embudos, señales UX y Form
  Analytics.
- Analítica de sesiones y análisis ordenado de embudos.
- Detección de Rage Clicks y Dead Clicks.
- Form Analytics con detección de abandono, métricas de formularios iniciados,
  enviados y abandonados.
- Field-level friction analysis para identificar los campos con mayor
  fricción sin capturar valores escritos.
- Mapas de clics por viewport y mapas de página completa sensibles al
  desplazamiento.
- Segmentación por desktop, tablet, mobile y unknown.
- Zonas de intensidad y distribución de clics por profundidad de
  desplazamiento.
- Permisos separados para API keys de tipo `ingest` y `read`.
- Aislamiento de datos por proyecto.
- Persistencia en PostgreSQL con migraciones Alembic.
- Smoke tests de extremo a extremo para los principales flujos de analítica.

## Arquitectura

```text
Sitio instrumentado -> SDK TypeScript -> FastAPI /v1/events -> PostgreSQL
Dashboard Next.js -> API de consulta -> servicios de analítica -> PostgreSQL
```

La ingesta requiere una clave `ingest`; las consultas requieren `read` o master.
Docker Compose levanta únicamente PostgreSQL, no el frontend ni el backend.

- `backend/`: API FastAPI, modelos SQLAlchemy, servicios de analítica y
  migraciones Alembic.
- `frontend/`: dashboard en Next.js para eventos, sesiones, embudos, señales
  UX, formularios y mapas de clics.
- `sdk/`: SDK para navegador que captura vistas de página, clics, profundidad
  de desplazamiento, eventos personalizados y metadata estructural segura de
  formularios.
- `scripts/`: utilidades de base de datos y smoke tests de extremo a extremo.

## Capturas

### Vista general del dashboard

![Vista general del dashboard de UXPulse Analytics](docs/screenshots/dashboard-overview.png)

### Analítica de sesiones

![Analítica de sesiones de UXPulse](docs/screenshots/sessions.png)

### Análisis de embudos

![Análisis de embudos de UXPulse](docs/screenshots/funnels.png)

### Señales UX

![Señales UX de UXPulse](docs/screenshots/ux-signals.png)

### Form Analytics

![Form Analytics de UXPulse](docs/screenshots/form-analytics.png)

### Mapa de clics por viewport

![Mapa de clics por viewport de UXPulse](docs/screenshots/click-heatmap-viewport.png)

### Mapa de clics de página completa

![Mapa de clics de página completa de UXPulse](docs/screenshots/click-heatmap-full-page.png)

### Documentación de la API

![Documentación FastAPI de UXPulse](docs/screenshots/swagger.png)

## API keys

Las claves de proyecto tienen permisos separados:

- `ingest`: destinada al SDK del navegador. Solo puede enviar eventos.
- `read`: destinada al dashboard o a clientes de analítica confiables del lado
  del servidor. Solo puede consultar la analítica.
- La master key puede administrar proyectos y consultar la analítica de todos
  los proyectos.

Nunca incluyas una clave `read` ni la master key en una aplicación pública del
navegador.

Crea una clave de proyecto con permisos definidos:

```json
{
  "name": "SDK de navegador en producción",
  "key_type": "ingest"
}
```

Usa `"key_type": "read"` para una clave destinada al dashboard.

## Privacidad

La captura de formularios sigue un enfoque privacy-by-design. UXPulse no
recopila valores de formularios, contraseñas, textos escritos, selecciones ni
estados `checked`; solo utiliza metadata estructural segura para la analítica.

## Tiempo de los eventos

Los eventos almacenan dos marcas de tiempo:

- `occurred_at`: cuándo ocurrió el evento en el navegador.
- `created_at`: cuándo el backend guardó el evento.

Las sesiones, los embudos, el orden de eventos recientes y la detección de Rage
Clicks usan `occurred_at`. Durante la migración, las filas antiguas reciben el
valor existente de `created_at`.

## Migraciones de base de datos

Instala las dependencias del backend:

```powershell
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Para una base de datos nueva, aplica todas las migraciones desde la raíz del
repositorio:

```powershell
backend\venv\Scripts\python.exe scripts\create_tables.py
```

Para una base de datos creada previamente con `Base.metadata.create_all`,
adopta la migración base una vez y luego actualiza:

```powershell
backend\venv\Scripts\python.exe -m alembic -c alembic.ini stamp 20260609_0001
backend\venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
```

No ejecutes `stamp` sobre una base de datos vacía. Las bases nuevas deben
ejecutar directamente `upgrade head`.

Las claves de proyecto existentes se migran a `ingest` porque podrían estar
incluidas en código del navegador. Después de actualizar, crea una nueva clave
`read` para cada dashboard o cliente de analítica confiable.

## Ejecución local

Requisitos: Python 3.12, Node.js 20.9 o superior con npm y PostgreSQL 16
(o Docker con Compose). Comandos PowerShell desde la raíz, salvo donde se indica.
No sobrescribas un `.env` ni un entorno virtual que ya tengas configurados.

```powershell
python -m venv backend/venv
backend\venv\Scripts\python.exe -m pip install -r backend/requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d postgres
```

**Importante:** `.env.example` no coincide con los valores del Compose actual.
Para el contenedor de desarrollo incluido, configura en `.env`:

```env
DATABASE_URL=postgresql+psycopg://uxpulse_user:uxpulse_password@127.0.0.1:5434/uxpulse_analytics
UXPULSE_MASTER_API_KEY=REEMPLAZAR_POR_UN_SECRETO_ALEATORIO
```

La contraseña anterior es la de desarrollo declarada en `docker-compose.yml`,
no una credencial para producción. Si usas PostgreSQL propio, adapta la URL.
No cambies credenciales de un volumen existente suponiendo que Compose las
actualizará: los valores de inicialización solo se aplican a una base nueva.

Aplica las migraciones con el comando de la sección anterior. Instala el frontend:

```powershell
cd frontend
npm.cmd ci
```

Backend:

```powershell
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8002
```

Frontend:

```powershell
cd frontend
npm.cmd run dev:3003
```

Abre `http://127.0.0.1:3003` y usa la master key o una clave de proyecto
`read`. La demo del SDK debe usar una clave de proyecto `ingest`.

Ejecuta backend y frontend en terminales separadas, partiendo de la raíz en cada
una. Swagger está en `http://127.0.0.1:8002/docs`. El dashboard apunta a esa API
mediante `API_BASE_URL` en `frontend/app/page.tsx`; no usa una variable de entorno
para cambiarla actualmente. Una base nueva no contiene eventos de demostración.

Para compilar el SDK, desde la raíz: `cd sdk`, `npm.cmd ci`, `npm.cmd run build`.

## API: primer flujo

Los endpoints protegidos usan `Authorization: Bearer <token>`.
Ejemplo PowerShell con el backend activo y la master key configurada localmente:

```powershell
$base = 'http://127.0.0.1:8002'
$admin = @{ Authorization = "Bearer $env:UXPULSE_MASTER_API_KEY" }
$project = Invoke-RestMethod "$base/v1/projects" -Method Post -Headers $admin -ContentType 'application/json' -Body '{"name":"Demo local","slug":"demo-local"}'
$key = Invoke-RestMethod "$base/v1/projects/$($project.project_id)/api-keys" -Method Post -Headers $admin -ContentType 'application/json' -Body '{"name":"SDK local","key_type":"ingest"}'
$ingest = @{ Authorization = "Bearer $($key.api_key)" }
Invoke-RestMethod "$base/v1/events" -Method Post -Headers $ingest -ContentType 'application/json' -Body '{"session_id":"demo-session-001","event_type":"page_view","page_path":"/demo"}'
```

Define `$env:UXPULSE_MASTER_API_KEY` con el mismo secreto de `.env`; PowerShell
no carga ese archivo automáticamente. Usa un slug distinto si ya existe el proyecto.
Guarda la clave devuelta de forma segura; no la incluyas en documentación pública.
Repite la creación de clave con `key_type: read` para el dashboard privado.

| Método y ruta | Uso |
| --- | --- |
| `GET /health` | Disponibilidad de la API |
| `GET /v1/auth/whoami` | Identidad y permisos del token |
| `POST /v1/projects` | Crear proyecto con master key |
| `POST /v1/projects/{project_id}/api-keys` | Crear clave con permisos |
| `POST /v1/events`, `POST /v1/events/batch` | Ingesta individual o hasta 100 eventos por lote |
| `GET /v1/sessions` | Consultar sesiones |
| `POST /v1/funnels/analyze` | Analizar pasos de un embudo |
| `GET /v1/forms/summary` | Métricas de formularios |
| `GET /v1/ux-signals/summary` | Resumen de señales UX |
| `GET /v1/heatmaps/clicks` | Distribución de clics |

Swagger documenta los parámetros, esquemas y respuestas completos.

## Decisiones técnicas y límites

- **Permisos separados:** el SDK público solo necesita ingesta; una clave de
  consulta expuesta permitiría leer analítica del proyecto.
- **Tiempo de ocurrencia:** `occurred_at` conserva el orden de interacción aunque
  los lotes lleguen después; `created_at` conserva el momento de persistencia.
- **Metadata de formularios:** se analiza estructura y actividad, no valores
  escritos, para reducir la exposición de información sensible.
- **SQLAlchemy y Alembic:** los cambios de esquema se aplican con migraciones;
  `create_all` no sustituye una actualización de una base existente.
- **Señales heurísticas:** rage clicks, dead clicks y abandono orientan una
  investigación UX; no prueban por sí solos la causa del problema.
- **Dashboard privado:** actualmente guarda el token en `localStorage`. No es un
  sistema completo de cuentas de usuario; no publiques el dashboard con secretos
  preconfigurados ni uses equipos compartidos para la master key.
- **Despliegue:** la URL de API y CORS están orientados al desarrollo local.
  HTTPS, orígenes permitidos, retención de datos y gestión de secretos requieren
  configuración antes de un despliegue público.

## Smoke tests

Con PostgreSQL y el backend en ejecución:

```powershell
python scripts\smoke_test_projects_auth.py
python scripts\smoke_test_events.py
python scripts\smoke_test_sessions.py
python scripts\smoke_test_funnels.py
python scripts\smoke_test_ux_signals.py
python scripts\smoke_test_heatmaps.py
python scripts\smoke_test_forms.py
```

## Higiene del repositorio

Los entornos virtuales, `node_modules`, bytecode de Python, artefactos de
compilación, archivos locales de entorno y cachés de pruebas están ignorados.
Las dependencias deben reconstruirse desde los manifiestos versionados, en
lugar de subirse a Git.
