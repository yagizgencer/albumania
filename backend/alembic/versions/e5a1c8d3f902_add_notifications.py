"""add_notifications

Revision ID: e5a1c8d3f902
Revises: d4e91c2a87bf
Create Date: 2026-05-17 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5a1c8d3f902"
down_revision: Union[str, Sequence[str], None] = "d4e91c2a87bf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipient_username", sa.String(length=30), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "friend_request",
                "friend_accept",
                "listen_invite",
                "friend_published",
                name="notificationtype",
            ),
            nullable=False,
        ),
        sa.Column("actor_username", sa.String(length=30), nullable=True),
        sa.Column("friendship_id", sa.Integer(), nullable=True),
        sa.Column("invite_id", sa.Integer(), nullable=True),
        sa.Column("album_id", sa.Integer(), nullable=True),
        sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_username"], ["users.username"]),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"]),
        sa.ForeignKeyConstraint(["friendship_id"], ["friendships.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invite_id"], ["listen_invites.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_username"], ["users.username"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_notifications_recipient_username"),
            ["recipient_username"],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f("ix_notifications_friendship_id"), ["friendship_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_notifications_invite_id"), ["invite_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notifications_invite_id"))
        batch_op.drop_index(batch_op.f("ix_notifications_friendship_id"))
        batch_op.drop_index(batch_op.f("ix_notifications_recipient_username"))
    op.drop_table("notifications")
