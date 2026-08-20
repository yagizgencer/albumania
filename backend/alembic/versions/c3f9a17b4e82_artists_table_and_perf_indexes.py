"""artists table and performance indexes

Revision ID: c3f9a17b4e82
Revises: 55e71d136ad0
Create Date: 2026-08-20 12:00:00.000000

Two things, both from the Phase 57 performance work:

1. An `artists` table, so trending artist photos come from our own DB instead of
   up to 20 sequential Spotify calls per home-page load.
2. Composite indexes matching the filters the hot queries actually use. Every
   foreign key was already indexed; what was missing were the multi-column
   combinations (e.g. notifications filtered by recipient AND read), which forced
   Postgres to index-scan a user's rows and then filter in the heap.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3f9a17b4e82"
down_revision: Union[str, Sequence[str], None] = "55e71d136ad0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "artists",
        sa.Column("spotify_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("image_url", sa.String(length=512), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("spotify_id"),
    )

    # The most-called query in the app: the notification badge poll, which filters
    # recipient + unread.
    op.create_index(
        "ix_notifications_recipient_read",
        "notifications",
        ["recipient_username", "read"],
    )
    # Notification list + prune, which order by created_at within a recipient.
    op.create_index(
        "ix_notifications_recipient_created",
        "notifications",
        ["recipient_username", "created_at"],
    )
    # The only two unindexed foreign keys on the table.
    op.create_index("ix_notifications_album_id", "notifications", ["album_id"])
    op.create_index("ix_notifications_actor_username", "notifications", ["actor_username"])

    # Album stats and artist-page aggregates: album_id + published status.
    op.create_index("ix_ratings_album_status", "ratings", ["album_id", "status"])
    # The activity feed: a user's published ratings, newest first.
    op.create_index(
        "ix_ratings_username_status_completed",
        "ratings",
        ["username", "status", "completed_at"],
    )

    # Friend lookups filter on status alongside one of the two username columns;
    # the OR across them needs both to avoid a heap filter on status.
    op.create_index("ix_friendships_user_a_status", "friendships", ["user_a_username", "status"])
    op.create_index("ix_friendships_user_b_status", "friendships", ["user_b_username", "status"])

    # Comment feed: an album's comments, newest first.
    op.create_index("ix_comments_album_created", "comments", ["album_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_comments_album_created", table_name="comments")
    op.drop_index("ix_friendships_user_b_status", table_name="friendships")
    op.drop_index("ix_friendships_user_a_status", table_name="friendships")
    op.drop_index("ix_ratings_username_status_completed", table_name="ratings")
    op.drop_index("ix_ratings_album_status", table_name="ratings")
    op.drop_index("ix_notifications_actor_username", table_name="notifications")
    op.drop_index("ix_notifications_album_id", table_name="notifications")
    op.drop_index("ix_notifications_recipient_created", table_name="notifications")
    op.drop_index("ix_notifications_recipient_read", table_name="notifications")
    op.drop_table("artists")
