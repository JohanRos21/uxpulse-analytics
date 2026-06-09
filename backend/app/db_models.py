from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'inactive')",
            name="ck_projects_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )


class ProjectApiKey(Base):
    __tablename__ = "project_api_keys"
    __table_args__ = (
        CheckConstraint(
            "key_type IN ('ingest', 'read')",
            name="ck_project_api_keys_key_type",
        ),
        CheckConstraint(
            "status IN ('active', 'revoked')",
            name="ck_project_api_keys_status",
        ),
        UniqueConstraint("key_hash", name="uq_project_api_keys_key_hash"),
        Index(
            "ix_project_api_keys_project_type_status",
            "project_id",
            "key_type",
            "status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key_id: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    project_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    key_type: Mapped[str] = mapped_column(String(20), default="ingest", nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(30), nullable=False)
    key_last4: Mapped[str] = mapped_column(String(10), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index(
            "ix_events_project_session_occurred_at",
            "project_id",
            "session_id",
            "occurred_at",
        ),
        Index(
            "ix_events_project_type_occurred_at",
            "project_id",
            "event_type",
            "occurred_at",
        ),
        Index(
            "ix_events_project_page_path",
            "project_id",
            "page_path",
        ),
        Index(
            "ix_events_project_occurred_at",
            "project_id",
            "occurred_at",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_id: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    project_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("projects.project_id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    session_id: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    anonymous_user_id: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)

    event_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    page_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    page_path: Mapped[str | None] = mapped_column(String(500), index=True, nullable=True)

    element_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    element_text: Mapped[str | None] = mapped_column(String(300), nullable=True)

    x: Mapped[float | None] = mapped_column(Float, nullable=True)
    y: Mapped[float | None] = mapped_column(Float, nullable=True)
    viewport_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    viewport_height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
        nullable=False,
    )
