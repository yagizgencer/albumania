"""add_duration_ms_to_album_tracks

Revision ID: f4a2b8d91e07
Revises: b5d2f4a7e103
Create Date: 2026-05-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4a2b8d91e07"
down_revision: Union[str, Sequence[str], None] = "b5d2f4a7e103"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("album_tracks", schema=None) as batch_op:
        batch_op.add_column(sa.Column("duration_ms", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("album_tracks", schema=None) as batch_op:
        batch_op.drop_column("duration_ms")
