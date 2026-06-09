from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

BASE_URL = os.getenv("UXPULSE_API_URL", "http://127.0.0.1:8002").rstrip("/")
MASTER_KEY = os.getenv("UXPULSE_MASTER_API_KEY", "").strip()
TIMEOUT_SECONDS = 15


def require_master_key() -> str:
    if not MASTER_KEY:
        raise RuntimeError("UXPULSE_MASTER_API_KEY is missing from .env")
    return MASTER_KEY


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def request_ok(
    method: str,
    path: str,
    *,
    token: str | None = None,
    json: Any = None,
    params: dict[str, Any] | None = None,
) -> requests.Response:
    headers = auth_headers(token) if token else None
    response = requests.request(
        method,
        f"{BASE_URL}{path}",
        headers=headers,
        json=json,
        params=params,
        timeout=TIMEOUT_SECONDS,
    )
    if not response.ok:
        raise AssertionError(
            f"{method} {path} returned {response.status_code}: {response.text}"
        )
    return response


def expect_status(
    method: str,
    path: str,
    expected_status: int,
    *,
    token: str | None = None,
    json: Any = None,
    params: dict[str, Any] | None = None,
) -> requests.Response:
    headers = auth_headers(token) if token else None
    response = requests.request(
        method,
        f"{BASE_URL}{path}",
        headers=headers,
        json=json,
        params=params,
        timeout=TIMEOUT_SECONDS,
    )
    if response.status_code != expected_status:
        raise AssertionError(
            f"{method} {path} returned {response.status_code}, expected "
            f"{expected_status}: {response.text}"
        )
    return response


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def unique_suffix() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")


def iso_at(base: datetime, seconds: float) -> str:
    return (base + timedelta(seconds=seconds)).isoformat()


def create_project_with_keys(
    label: str,
) -> tuple[str, str, str]:
    master_key = require_master_key()
    suffix = unique_suffix()
    slug = f"{label.lower().replace(' ', '-')}-{suffix}"
    project = request_ok(
        "POST",
        "/v1/projects",
        token=master_key,
        json={"name": f"{label} {suffix}", "slug": slug},
    ).json()
    project_id = project["project_id"]

    ingest = request_ok(
        "POST",
        f"/v1/projects/{project_id}/api-keys",
        token=master_key,
        json={"name": f"{label} Ingest", "key_type": "ingest"},
    ).json()
    read = request_ok(
        "POST",
        f"/v1/projects/{project_id}/api-keys",
        token=master_key,
        json={"name": f"{label} Read", "key_type": "read"},
    ).json()

    assert_true(ingest["key_type"] == "ingest", "Expected an ingest key")
    assert_true(read["key_type"] == "read", "Expected a read key")
    return project_id, ingest["api_key"], read["api_key"]


def run_smoke(name: str, callback: Any) -> None:
    print(f"[START] {name}")
    try:
        callback()
    except (AssertionError, RuntimeError, requests.RequestException) as exc:
        print(f"[ERROR] {exc}")
        raise SystemExit(1) from exc
    print(f"[OK] {name}")
