"""Create + count + mark-read helpers for the unified Notification table.

The 4 channels:
  - friend_request    : someone wants to friend you
  - friend_accept     : your friend request was accepted
  - listen_invite     : someone invited you to listen to an album
  - friend_published  : a friend you're listening with finished rating first

Counts feed three independent badges (bell / Listen Later / Friends) that the
frontend clears via `mark_seen(scope=...)`.
"""
from __future__ import annotations

from typing import Literal

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationType

# How many already-read notifications we retain per user. Unread rows are always
# kept; older read rows are pruned so the table doesn't grow without bound.
READ_RETENTION = 10


def create_notification(
    db: Session,
    *,
    recipient_username: str,
    type: NotificationType,
    actor_username: str | None = None,
    friendship_id: int | None = None,
    invite_id: int | None = None,
    album_id: int | None = None,
    comment_id: int | None = None,
) -> Notification:
    """Insert a notification row. Caller commits."""
    n = Notification(
        recipient_username=recipient_username,
        type=type,
        actor_username=actor_username,
        friendship_id=friendship_id,
        invite_id=invite_id,
        album_id=album_id,
        comment_id=comment_id,
    )
    db.add(n)
    return n


def summary_counts(db: Session, username: str) -> dict[str, int]:
    """Counts powering the three nav badges. Each is unread-count filtered
    to the relevant type(s)."""
    rows = db.execute(
        select(Notification.type)
        .where(
            Notification.recipient_username == username,
            Notification.read.is_(False),
        )
    ).all()
    by_type: dict[NotificationType, int] = {}
    for (t,) in rows:
        by_type[t] = by_type.get(t, 0) + 1
    return {
        "bell": sum(by_type.values()),
        "listen_invites": by_type.get(NotificationType.listen_invite, 0),
        "friend_requests": by_type.get(NotificationType.friend_request, 0),
    }


Scope = Literal["bell", "listen_invites", "friend_requests"]


def mark_seen(db: Session, username: str, scope: Scope) -> int:
    """Flip `read=True` on the rows the badge represents. Returns the number
    of rows updated. Caller commits.

    - bell: all unread for this user (drains every channel — the bell is a
      single dismiss surface).
    - listen_invites / friend_requests: only the specific type, so visiting
      one tab doesn't silently clear the others.
    """
    stmt = (
        update(Notification)
        .where(
            Notification.recipient_username == username,
            Notification.read.is_(False),
        )
        .values(read=True)
    )
    if scope == "listen_invites":
        stmt = stmt.where(Notification.type == NotificationType.listen_invite)
    elif scope == "friend_requests":
        stmt = stmt.where(Notification.type == NotificationType.friend_request)
    elif scope != "bell":
        raise ValueError(f"Unknown notification scope: {scope!r}")
    result = db.execute(stmt)
    # Marking rows read is the only way rows enter the "read" set, so this is the
    # natural moment to trim it back down.
    prune_read_notifications(db, username)
    return result.rowcount or 0


def prune_read_notifications(
    db: Session, username: str, keep: int = READ_RETENTION
) -> int:
    """Delete a user's oldest read notifications, keeping only the `keep` most
    recent. Unread rows are never touched. Returns the number deleted. Caller
    commits."""
    read_ids = list(
        db.scalars(
            select(Notification.id)
            .where(
                Notification.recipient_username == username,
                Notification.read.is_(True),
            )
            .order_by(Notification.created_at.desc())
        )
    )
    stale = read_ids[keep:]
    if not stale:
        return 0
    db.execute(delete(Notification).where(Notification.id.in_(stale)))
    return len(stale)
