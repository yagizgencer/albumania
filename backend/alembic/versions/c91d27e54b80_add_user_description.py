"""add_user_description

Revision ID: c91d27e54b80
Revises: f4a2b8d91e07
Create Date: 2026-05-16 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c91d27e54b80"
down_revision: Union[str, Sequence[str], None] = "f4a2b8d91e07"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("description", sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("description")
