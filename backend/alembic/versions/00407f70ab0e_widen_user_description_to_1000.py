"""widen_user_description_to_1000

Revision ID: 00407f70ab0e
Revises: d7f2a4c19e35
Create Date: 2026-07-04 19:43:57.652342

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '00407f70ab0e'
down_revision: Union[str, Sequence[str], None] = 'd7f2a4c19e35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column(
            "description",
            existing_type=sa.String(length=500),
            type_=sa.String(length=1000),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column(
            "description",
            existing_type=sa.String(length=1000),
            type_=sa.String(length=500),
            existing_nullable=True,
        )
