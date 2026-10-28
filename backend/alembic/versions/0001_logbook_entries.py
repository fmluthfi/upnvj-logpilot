"""Create the local logbook entry table."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_logbook_entries"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "logbook_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_document_id", sa.String(length=256), nullable=True),
        sa.Column("source_row_index", sa.Integer(), nullable=True),
        sa.Column("source_hash", sa.String(length=64), nullable=True),
        sa.Column("week_number", sa.Integer(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("original_activity", sa.Text(), nullable=True),
        sa.Column("activity_text", sa.Text(), nullable=True),
        sa.Column("result_text", sa.Text(), nullable=True),
        sa.Column("obstacle_text", sa.Text(), nullable=True),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("documentation_url", sa.Text(), nullable=True),
        sa.Column("reflection_text", sa.Text(), nullable=True),
        sa.Column("reflection_approved", sa.Boolean(), nullable=False),
        sa.Column("entry_approved", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("portal_entry_id", sa.String(length=256), nullable=True),
        sa.Column("last_submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_logbook_entries_date", "logbook_entries", ["date"])
    op.create_index("ix_logbook_entries_status", "logbook_entries", ["status"])


def downgrade() -> None:
    op.drop_index("ix_logbook_entries_status", table_name="logbook_entries")
    op.drop_index("ix_logbook_entries_date", table_name="logbook_entries")
    op.drop_table("logbook_entries")
