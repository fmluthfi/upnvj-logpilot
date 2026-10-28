"""Keep imported source snapshots and conflict state."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_google_docs_sources"
down_revision: Union[str, None] = "0001_logbook_entries"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("logbook_entries", sa.Column("source_payload_json", sa.Text(), nullable=True))
    op.add_column(
        "logbook_entries",
        sa.Column("source_conflict", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("logbook_entries", "source_conflict")
    op.drop_column("logbook_entries", "source_payload_json")
