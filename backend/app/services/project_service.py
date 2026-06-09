import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db_models import Project, ProjectApiKey


def utc_now():
    return datetime.now(timezone.utc)


def generate_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4).upper()}"


def generate_project_api_key() -> str:
    return f"uxp_{secrets.token_urlsafe(32)}"


def hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def create_project(db: Session, name: str, slug: str) -> Project:
    existing_slug = db.query(Project).filter(Project.slug == slug).first()
    if existing_slug:
        raise ValueError("Project slug already exists.")

    project = Project(
        project_id=generate_id("PROJ"),
        name=name,
        slug=slug,
        status="active",
    )

    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def list_projects(db: Session) -> list[Project]:
    return db.query(Project).order_by(Project.created_at.desc()).all()


def get_project(db: Session, project_id: str) -> Project | None:
    return db.query(Project).filter(Project.project_id == project_id).first()


def create_project_api_key(
    db: Session,
    project_id: str,
    name: str,
    key_type: str = "ingest",
) -> tuple[ProjectApiKey, str]:
    project = get_project(db, project_id)

    if not project:
        raise ValueError("Project not found.")

    if project.status != "active":
        raise ValueError("Project is not active.")

    if key_type not in {"ingest", "read"}:
        raise ValueError("API key type must be 'ingest' or 'read'.")

    plain_key = generate_project_api_key()

    api_key = ProjectApiKey(
        key_id=generate_id("KEY"),
        project_id=project_id,
        name=name,
        key_type=key_type,
        key_prefix=plain_key[:12],
        key_last4=plain_key[-4:],
        key_hash=hash_api_key(plain_key),
        status="active",
    )

    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return api_key, plain_key


def verify_project_api_key(db: Session, api_key: str) -> tuple[ProjectApiKey, Project] | None:
    key_hash = hash_api_key(api_key)

    key = (
        db.query(ProjectApiKey)
        .filter(ProjectApiKey.key_hash == key_hash)
        .filter(ProjectApiKey.status == "active")
        .first()
    )

    if not key:
        return None

    project = get_project(db, key.project_id)

    if not project or project.status != "active":
        return None

    now = utc_now()
    if key.last_used_at is None or now - key.last_used_at >= timedelta(minutes=15):
        key.last_used_at = now
        db.commit()

    return key, project


def rotate_project_api_key(
    db: Session,
    project_id: str,
    key_type: str = "ingest",
) -> tuple[ProjectApiKey, str]:
    project = get_project(db, project_id)

    if not project:
        raise ValueError("Project not found.")

    if key_type not in {"ingest", "read"}:
        raise ValueError("API key type must be 'ingest' or 'read'.")

    old_keys = (
        db.query(ProjectApiKey)
        .filter(ProjectApiKey.project_id == project_id)
        .filter(ProjectApiKey.key_type == key_type)
        .filter(ProjectApiKey.status == "active")
        .all()
    )

    for key in old_keys:
        key.status = "revoked"
        key.revoked_at = utc_now()

    return create_project_api_key(
        db,
        project_id,
        f"Rotated {key_type} key",
        key_type=key_type,
    )
