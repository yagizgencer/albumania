"""add_profile_picture_key

Revision ID: d4e91c2a87bf
Revises: c91d27e54b80
Create Date: 2026-05-17 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e91c2a87bf"
down_revision: Union[str, Sequence[str], None] = "c91d27e54b80"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("profile_picture_key", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("profile_picture_key")
