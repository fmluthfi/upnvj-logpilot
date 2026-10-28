"""Store optional local default work hours."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_logbook_settings"
down_revision: Union[str, None] = "0002_google_docs_sources"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "logbook_settings",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("default_start_time", sa.Time(), nullable=True),
        sa.Column("default_end_time", sa.Time(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("logbook_settings")
