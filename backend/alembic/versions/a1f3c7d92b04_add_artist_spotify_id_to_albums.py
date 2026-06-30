"""add_artist_spotify_id_to_albums

Revision ID: a1f3c7d92b04
Revises: f7c1a9e4d210
Create Date: 2026-06-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1f3c7d92b04"
down_revision: Union[str, Sequence[str], None] = "f7c1a9e4d210"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("albums", schema=None) as batch_op:
        batch_op.add_column(sa.Column("artist_spotify_id", sa.String(length=64), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_albums_artist_spotify_id"), ["artist_spotify_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("albums", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_albums_artist_spotify_id"))
        batch_op.drop_column("artist_spotify_id")
