"""add_friends_profile_visibility

Revision ID: c3e5a7b91d24
Revises: b2d4e6f80a13
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c3e5a7b91d24"
down_revision: Union[str, Sequence[str], None] = "b2d4e6f80a13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New profile-visibility level. Postgres has a native enum type that needs an
    # explicit ALTER TYPE; SQLite stores the column as VARCHAR (SQLAlchemy Enum
    # creates no CHECK constraint by default), so nothing to do there.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE profilevisibility ADD VALUE IF NOT EXISTS 'friends'")


def downgrade() -> None:
    # Removing a value from a native Postgres enum isn't supported without
    # recreating the type; left in place.
    pass
