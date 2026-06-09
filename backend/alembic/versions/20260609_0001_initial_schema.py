"""Baseline schema for projects, API keys, and events.

Revision ID: 20260609_0001
Revises:
Create Date: 2026-06-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260609_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_projects_id", "projects", ["id"])
    op.create_index("ix_projects_project_id", "projects", ["project_id"], unique=True)
    op.create_index("ix_projects_slug", "projects", ["slug"], unique=True)

    op.create_table(
        "project_api_keys",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key_id", sa.String(length=40), nullable=False),
        sa.Column("project_id", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("key_prefix", sa.String(length=30), nullable=False),
        sa.Column("key_last4", sa.String(length=10), nullable=False),
        sa.Column("key_hash", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "key_hash",
            name="project_api_keys_key_hash_key",
        ),
    )
    op.create_index("ix_project_api_keys_id", "project_api_keys", ["id"])
    op.create_index(
        "ix_project_api_keys_key_id",
        "project_api_keys",
        ["key_id"],
        unique=True,
    )
    op.create_index(
        "ix_project_api_keys_project_id",
        "project_api_keys",
        ["project_id"],
    )

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(length=40), nullable=False),
        sa.Column("project_id", sa.String(length=40), nullable=False),
        sa.Column("session_id", sa.String(length=120), nullable=False),
        sa.Column("anonymous_user_id", sa.String(length=120), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("page_url", sa.Text(), nullable=True),
        sa.Column("page_path", sa.String(length=500), nullable=True),
        sa.Column("element_id", sa.String(length=200), nullable=True),
        sa.Column("element_text", sa.String(length=300), nullable=True),
        sa.Column("x", sa.Float(), nullable=True),
        sa.Column("y", sa.Float(), nullable=True),
        sa.Column("viewport_width", sa.Integer(), nullable=True),
        sa.Column("viewport_height", sa.Integer(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_events_id", "events", ["id"])
    op.create_index("ix_events_event_id", "events", ["event_id"], unique=True)
    op.create_index("ix_events_project_id", "events", ["project_id"])
    op.create_index("ix_events_session_id", "events", ["session_id"])
    op.create_index(
        "ix_events_anonymous_user_id",
        "events",
        ["anonymous_user_id"],
    )
    op.create_index("ix_events_event_type", "events", ["event_type"])
    op.create_index("ix_events_page_path", "events", ["page_path"])


def downgrade() -> None:
    op.drop_table("events")
    op.drop_table("project_api_keys")
    op.drop_table("projects")
