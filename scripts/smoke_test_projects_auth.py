from smoke_helpers import (
    assert_true,
    create_project_with_keys,
    request_ok,
    require_master_key,
    run_smoke,
)


def main() -> None:
    master_key = require_master_key()

    health = request_ok("GET", "/health").json()
    assert_true(bool(health), "Health response is empty")
    print("[OK] Backend health")

    master_auth = request_ok(
        "GET",
        "/v1/auth/whoami",
        token=master_key,
    ).json()
    assert_true(master_auth["auth_type"] == "master", "Master auth failed")
    print("[OK] Master authentication")

    project_id, ingest_key, read_key = create_project_with_keys("Auth Smoke")
    projects = request_ok("GET", "/v1/projects", token=master_key).json()
    assert_true(
        any(project["project_id"] == project_id for project in projects),
        "Created project was not listed",
    )
    print("[OK] Project creation and listing")

    ingest_auth = request_ok(
        "GET",
        "/v1/auth/whoami",
        token=ingest_key,
    ).json()
    read_auth = request_ok(
        "GET",
        "/v1/auth/whoami",
        token=read_key,
    ).json()
    assert_true(ingest_auth["project_id"] == project_id, "Wrong ingest project")
    assert_true(ingest_auth["key_type"] == "ingest", "Wrong ingest scope")
    assert_true(read_auth["project_id"] == project_id, "Wrong read project")
    assert_true(read_auth["key_type"] == "read", "Wrong read scope")
    print("[OK] Scoped project authentication")


if __name__ == "__main__":
    run_smoke("Projects and scoped auth", main)
