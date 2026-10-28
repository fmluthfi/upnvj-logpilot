"""Store a global documentation link."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_default_documentation_url"
down_revision: Union[str, None] = "0004_weekly_reflections"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("logbook_settings", sa.Column("default_documentation_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("logbook_settings", "default_documentation_url")
