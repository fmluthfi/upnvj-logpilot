"""Store weekly reflection drafts and approvals."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_weekly_reflections"
down_revision: Union[str, None] = "0003_logbook_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "weekly_reflections",
        sa.Column("friday_date", sa.Date(), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("reflection_text", sa.Text(), nullable=True),
        sa.Column("approved", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.current_timestamp(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("friday_date", "source_hash"),
    )


def downgrade() -> None:
    op.drop_table("weekly_reflections")
