"""Add API key scopes, event time, constraints, and analytics indexes.

Revision ID: 20260609_0002
Revises: 20260609_0001
Create Date: 2026-06-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260609_0002"
down_revision: str | Sequence[str] | None = "20260609_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _drop_key_hash_unique_constraint() -> None:
    inspector = sa.inspect(op.get_bind())
    for constraint in inspector.get_unique_constraints("project_api_keys"):
        if constraint.get("column_names") == ["key_hash"]:
            op.drop_constraint(
                constraint["name"],
                "project_api_keys",
                type_="unique",
            )
            return


def upgrade() -> None:
    op.add_column(
        "project_api_keys",
        sa.Column(
            "key_type",
            sa.String(length=20),
            server_default="ingest",
            nullable=False,
        ),
    )
    op.alter_column("project_api_keys", "key_type", server_default=None)

    op.add_column(
        "events",
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE events SET occurred_at = created_at WHERE occurred_at IS NULL")
    op.alter_column("events", "occurred_at", nullable=False)

    op.create_check_constraint(
        "ck_projects_status",
        "projects",
        "status IN ('active', 'inactive')",
    )
    op.create_check_constraint(
        "ck_project_api_keys_key_type",
        "project_api_keys",
        "key_type IN ('ingest', 'read')",
    )
    op.create_check_constraint(
        "ck_project_api_keys_status",
        "project_api_keys",
        "status IN ('active', 'revoked')",
    )

    _drop_key_hash_unique_constraint()
    op.create_unique_constraint(
        "uq_project_api_keys_key_hash",
        "project_api_keys",
        ["key_hash"],
    )
    op.create_foreign_key(
        "fk_project_api_keys_project_id_projects",
        "project_api_keys",
        "projects",
        ["project_id"],
        ["project_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_events_project_id_projects",
        "events",
        "projects",
        ["project_id"],
        ["project_id"],
        ondelete="CASCADE",
    )

    op.create_index(
        "ix_project_api_keys_project_type_status",
        "project_api_keys",
        ["project_id", "key_type", "status"],
    )
    op.create_index("ix_events_occurred_at", "events", ["occurred_at"])
    op.create_index("ix_events_created_at", "events", ["created_at"])
    op.create_index(
        "ix_events_project_session_occurred_at",
        "events",
        ["project_id", "session_id", "occurred_at"],
    )
    op.create_index(
        "ix_events_project_type_occurred_at",
        "events",
        ["project_id", "event_type", "occurred_at"],
    )
    op.create_index(
        "ix_events_project_page_path",
        "events",
        ["project_id", "page_path"],
    )
    op.create_index(
        "ix_events_project_occurred_at",
        "events",
        ["project_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_events_project_occurred_at", table_name="events")
    op.drop_index("ix_events_project_page_path", table_name="events")
    op.drop_index("ix_events_project_type_occurred_at", table_name="events")
    op.drop_index("ix_events_project_session_occurred_at", table_name="events")
    op.drop_index("ix_events_created_at", table_name="events")
    op.drop_index("ix_events_occurred_at", table_name="events")
    op.drop_index(
        "ix_project_api_keys_project_type_status",
        table_name="project_api_keys",
    )

    op.drop_constraint(
        "fk_events_project_id_projects",
        "events",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_project_api_keys_project_id_projects",
        "project_api_keys",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_project_api_keys_key_hash",
        "project_api_keys",
        type_="unique",
    )
    op.create_unique_constraint(
        "project_api_keys_key_hash_key",
        "project_api_keys",
        ["key_hash"],
    )
    op.drop_constraint(
        "ck_project_api_keys_status",
        "project_api_keys",
        type_="check",
    )
    op.drop_constraint(
        "ck_project_api_keys_key_type",
        "project_api_keys",
        type_="check",
    )
    op.drop_constraint("ck_projects_status", "projects", type_="check")

    op.drop_column("events", "occurred_at")
    op.drop_column("project_api_keys", "key_type")
