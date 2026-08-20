"""spotify cooldown

Revision ID: e8b2d51c9a37
Revises: c3f9a17b4e82
Create Date: 2026-08-21 10:00:00.000000

Persists the Spotify rate-limit backoff so it survives a restart. Spotify hands
out multi-hour penalties and escalates if you call during one; a Render deploy
happens far more often than that, and would otherwise reset the breaker and
resume calling mid-penalty.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8b2d51c9a37"
down_revision: Union[str, Sequence[str], None] = "c3f9a17b4e82"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "spotify_cooldown",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("paused_until", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("spotify_cooldown")
