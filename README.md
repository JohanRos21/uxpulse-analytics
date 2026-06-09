# UXPulse Analytics

Self-hosted UX behavior analytics built with FastAPI, PostgreSQL, Next.js, and
a browser TypeScript SDK.

## Architecture

- `backend/`: FastAPI API, SQLAlchemy models, analytics services, and Alembic
  migrations.
- `frontend/`: Next.js dashboard for events, sessions, funnels, and UX signals.
- `sdk/`: browser SDK that captures page views, clicks, scroll depth, and
  custom events.
- `scripts/`: database and end-to-end smoke-test utilities.

## API keys

Project keys have separate capabilities:

- `ingest`: intended for the browser SDK. It can only send events.
- `read`: intended for the dashboard or trusted server-side analytics clients.
  It can only read analytics.
- The master key can administer projects and read analytics across projects.

Never embed a read key or the master key in a public browser application.

Create a scoped project key with:

```json
{
  "name": "Production browser SDK",
  "key_type": "ingest"
}
```

Use `"key_type": "read"` for a dashboard key.

## Event time

Events store both:

- `occurred_at`: when the event happened in the browser.
- `created_at`: when the backend persisted the event.

Sessions, funnels, recent-event ordering, and rage-click detection use
`occurred_at`. Older rows receive their existing `created_at` value during the
migration.

## Database migrations

Install backend dependencies:

```powershell
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

For a new database, apply all migrations from the repository root:

```powershell
backend\venv\Scripts\python.exe scripts\create_tables.py
```

For a database that was previously created with `Base.metadata.create_all`,
adopt the baseline once and then upgrade:

```powershell
backend\venv\Scripts\python.exe -m alembic -c alembic.ini stamp 20260609_0001
backend\venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
```

Do not run the `stamp` command on an empty database. New databases should run
`upgrade head` directly.

Existing project keys are migrated to `ingest` because they may already be
embedded in browser code. Create a new `read` key for each dashboard or trusted
analytics client after upgrading.

## Run locally

Backend:

```powershell
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8002
```

Frontend:

```powershell
cd frontend
npm run dev:3003
```

Open `http://127.0.0.1:3003` and use either the master key or a project `read`
key. The SDK demo must use a project `ingest` key.

## Smoke tests

With PostgreSQL and the backend running:

```powershell
python scripts\smoke_test_projects_auth.py
python scripts\smoke_test_events.py
python scripts\smoke_test_sessions.py
python scripts\smoke_test_funnels.py
python scripts\smoke_test_ux_signals.py
```

## Repository hygiene

Virtual environments, `node_modules`, Python bytecode, build output, local
environment files, and test caches are ignored. Dependencies should be
recreated from the committed manifests instead of committed to Git.
