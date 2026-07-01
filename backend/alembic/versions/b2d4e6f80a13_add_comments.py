"""add_comments

Revision ID: b2d4e6f80a13
Revises: a1f3c7d92b04
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2d4e6f80a13"
down_revision: Union[str, Sequence[str], None] = "a1f3c7d92b04"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=30), nullable=False),
        sa.Column("album_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column(
            "visibility",
            sa.Enum("public", "friends", "private", name="commentvisibility"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"]),
        sa.ForeignKeyConstraint(["username"], ["users.username"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_comments_album_id"), ["album_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_comments_username"), ["username"], unique=False)

    op.create_table(
        "comment_reactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("comment_id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=30), nullable=False),
        sa.Column("value", sa.SmallInteger(), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["username"], ["users.username"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("comment_id", "username", name="uq_comment_reaction_user"),
    )
    with op.batch_alter_table("comment_reactions", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_comment_reactions_comment_id"), ["comment_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_comment_reactions_username"), ["username"], unique=False
        )

    # New notification type value. On Postgres the enum is native and needs an
    # explicit ALTER TYPE; on SQLite the column is plain VARCHAR (SQLAlchemy's
    # Enum creates no CHECK constraint by default) so nothing to do.
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'comment_liked'")

    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.add_column(sa.Column("comment_id", sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_notifications_comment_id"), ["comment_id"], unique=False
        )
        batch_op.create_foreign_key(
            "fk_notifications_comment_id",
            "comments",
            ["comment_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.drop_constraint("fk_notifications_comment_id", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_notifications_comment_id"))
        batch_op.drop_column("comment_id")

    with op.batch_alter_table("comment_reactions", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_comment_reactions_username"))
        batch_op.drop_index(batch_op.f("ix_comment_reactions_comment_id"))
    op.drop_table("comment_reactions")

    with op.batch_alter_table("comments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_comments_username"))
        batch_op.drop_index(batch_op.f("ix_comments_album_id"))
    op.drop_table("comments")
    # Note: the 'comment_liked' enum value is left in place on Postgres —
    # dropping a value from a native enum isn't supported without recreating it.
