"""add_upc_to_albums

Revision ID: d7f2a4c19e35
Revises: c3e5a7b91d24
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7f2a4c19e35"
down_revision: Union[str, Sequence[str], None] = "c3e5a7b91d24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("albums", schema=None) as batch_op:
        batch_op.add_column(sa.Column("upc", sa.String(length=32), nullable=True))
        batch_op.create_index(batch_op.f("ix_albums_upc"), ["upc"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("albums", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_albums_upc"))
        batch_op.drop_column("upc")
