"""add_email_verified_to_users

Revision ID: f7c1a9e4d210
Revises: e5a1c8d3f902
Create Date: 2026-06-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7c1a9e4d210"
down_revision: Union[str, Sequence[str], None] = "e5a1c8d3f902"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "email_verified",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    # Existing accounts predate verification — treat them as already verified so
    # they aren't suddenly gated out of social actions.
    op.execute(sa.text("UPDATE users SET email_verified = true"))


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("email_verified")
