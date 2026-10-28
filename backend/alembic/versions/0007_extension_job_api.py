"""Add immutable extension job snapshots, claims and pairing state."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_extension_job_api"
down_revision: Union[str, None] = "0006_portal_automation_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("automation_runs") as batch:
        batch.add_column(sa.Column("runner", sa.String(length=16), server_default="playwright", nullable=False))
        batch.add_column(sa.Column("pause_requested", sa.Boolean(), server_default=sa.false(), nullable=False))

    with op.batch_alter_table("automation_run_entries") as batch:
        batch.add_column(sa.Column("snapshot_json", sa.Text(), nullable=True))
        batch.add_column(sa.Column("claimed_by", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table("logbook_settings") as batch:
        batch.add_column(sa.Column("extension_pairing_code_hash", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("extension_pairing_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("extension_token_hash", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("extension_token_created_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("logbook_settings") as batch:
        batch.drop_column("extension_token_created_at")
        batch.drop_column("extension_token_hash")
        batch.drop_column("extension_pairing_expires_at")
        batch.drop_column("extension_pairing_code_hash")

    with op.batch_alter_table("automation_run_entries") as batch:
        batch.drop_column("lease_expires_at")
        batch.drop_column("claimed_by")
        batch.drop_column("snapshot_json")

    with op.batch_alter_table("automation_runs") as batch:
        batch.drop_column("pause_requested")
        batch.drop_column("runner")
