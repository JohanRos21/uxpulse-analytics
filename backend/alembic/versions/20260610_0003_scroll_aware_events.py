"""Add scroll-aware click geometry to events.

Revision ID: 20260610_0003
Revises: 20260609_0002
Create Date: 2026-06-10
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260610_0003"
down_revision: str | Sequence[str] | None = "20260609_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("element_tag", sa.String(length=80), nullable=True),
    )
    op.add_column("events", sa.Column("scroll_x", sa.Float(), nullable=True))
    op.add_column("events", sa.Column("scroll_y", sa.Float(), nullable=True))
    op.add_column(
        "events",
        sa.Column("document_width", sa.Integer(), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("document_height", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("events", "document_height")
    op.drop_column("events", "document_width")
    op.drop_column("events", "scroll_y")
    op.drop_column("events", "scroll_x")
    op.drop_column("events", "element_tag")
