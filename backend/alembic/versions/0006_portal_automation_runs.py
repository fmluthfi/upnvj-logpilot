"""Persist daily portal automation runs and per-entry outcomes."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_portal_automation_runs"
down_revision: Union[str, None] = "0005_default_documentation_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "automation_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("total_entries", sa.Integer(), nullable=False),
        sa.Column("completed_entries", sa.Integer(), nullable=False),
        sa.Column("stop_requested", sa.Boolean(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_automation_runs_status", "automation_runs", ["status"])
    op.create_table(
        "automation_run_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("run_id", sa.String(length=36), nullable=False),
        sa.Column("entry_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("save_attempted", sa.Boolean(), nullable=False),
        sa.Column("safe_to_retry", sa.Boolean(), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False),
        sa.ForeignKeyConstraint(["entry_id"], ["logbook_entries.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["run_id"], ["automation_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "entry_id", name="uq_automation_run_entry"),
    )
    op.create_index("ix_automation_run_entries_run_id", "automation_run_entries", ["run_id"])
    op.create_index("ix_automation_run_entries_entry_id", "automation_run_entries", ["entry_id"])


def downgrade() -> None:
    op.drop_index("ix_automation_run_entries_entry_id", table_name="automation_run_entries")
    op.drop_index("ix_automation_run_entries_run_id", table_name="automation_run_entries")
    op.drop_table("automation_run_entries")
    op.drop_index("ix_automation_runs_status", table_name="automation_runs")
    op.drop_table("automation_runs")
