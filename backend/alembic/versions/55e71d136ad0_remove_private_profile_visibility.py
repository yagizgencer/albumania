"""remove_private_profile_visibility

Revision ID: 55e71d136ad0
Revises: 0e7e7d365ca1
Create Date: 2026-07-05 16:26:48.442542

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '55e71d136ad0'
down_revision: Union[str, Sequence[str], None] = '0e7e7d365ca1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Any lingering private profiles become friends-only (safety — the option is
    # gone). Runs on every dialect.
    op.execute(
        "UPDATE users SET profile_visibility = 'friends' "
        "WHERE profile_visibility = 'private'"
    )

    # On Postgres the enum is native and has no DROP VALUE — recreate the type
    # without 'private'. On SQLite the column is plain VARCHAR, so the UPDATE above
    # is all that's needed.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE profilevisibility RENAME TO profilevisibility_old")
        op.execute("CREATE TYPE profilevisibility AS ENUM ('public', 'friends')")
        op.execute(
            "ALTER TABLE users ALTER COLUMN profile_visibility DROP DEFAULT"
        )
        op.execute(
            "ALTER TABLE users ALTER COLUMN profile_visibility "
            "TYPE profilevisibility USING profile_visibility::text::profilevisibility"
        )
        op.execute(
            "ALTER TABLE users ALTER COLUMN profile_visibility "
            "SET DEFAULT 'public'::profilevisibility"
        )
        op.execute("DROP TYPE profilevisibility_old")


def downgrade() -> None:
    # Re-add 'private' to the enum (data is not restored — it was collapsed to
    # friends on upgrade).
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "ALTER TYPE profilevisibility ADD VALUE IF NOT EXISTS 'private'"
        )
