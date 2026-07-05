"""add_listen_invite_accepted_notification_type

Revision ID: 0e7e7d365ca1
Revises: 00407f70ab0e
Create Date: 2026-07-05 16:10:38.724092

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e7e7d365ca1'
down_revision: Union[str, Sequence[str], None] = '00407f70ab0e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New notification type value. On Postgres the enum is native and needs an
    # explicit ALTER TYPE; on SQLite the column is plain VARCHAR (no CHECK
    # constraint by default) so nothing to do. Mirrors the 'comment_liked' add.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'listen_invite_accepted'"
        )


def downgrade() -> None:
    # Dropping a value from a native Postgres enum isn't supported without
    # recreating the type; leave it in place (harmless).
    pass
