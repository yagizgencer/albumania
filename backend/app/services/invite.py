from datetime import datetime, timezone

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.models.invite import ListenInvite, ListenInviteStatus
from app.models.notification import NotificationType
from app.models.rating import Rating, RatingStatus
from app.services.friend_dashboard import rebuild_for_pair
from app.services.friendship import get_friendship
from app.services.notifications import create_notification


def maybe_complete_invites_for_rating(db: Session, username: str, album_id: int) -> None:
    """Called after `username` publishes a rating for `album_id`. For every
    accepted invite that involves them, notify the other party that `username`
    finished ("alice finished rating an album you're both listening to"), and:
      - if the other party has ALSO already published, this publish completes the
        shared listen: flip the invite to `completed` and rebuild the pair's
        dashboard.
      - otherwise it's still pending on the other side.
    Either way the other party is notified — so whoever publishes second still
    tells the first-publisher that they've now finished too.
    """
    invites = db.scalars(
        select(ListenInvite).where(
            ListenInvite.album_id == album_id,
            ListenInvite.status != ListenInviteStatus.completed,
            or_(
                ListenInvite.sender_username == username,
                ListenInvite.receiver_username == username,
            ),
        )
    ).all()

    now = datetime.now(timezone.utc)
    pairs_to_rebuild: list[int] = []
    for invite in invites:
        # Only accepted invites are a shared listen — a pending invite the other
        # side hasn't responded to yet doesn't notify anyone.
        if invite.status != ListenInviteStatus.accepted:
            continue

        other = (
            invite.receiver_username
            if invite.sender_username == username
            else invite.sender_username
        )

        # Tell the other party I've finished — whether they published before me
        # (this completes the listen) or haven't yet (their turn). This is what
        # was missing: the second publisher used to notify no one.
        create_notification(
            db,
            recipient_username=other,
            type=NotificationType.friend_published,
            actor_username=username,
            invite_id=invite.id,
            album_id=album_id,
        )

        other_published = db.scalar(
            select(Rating).where(
                Rating.username == other,
                Rating.album_id == album_id,
                Rating.status == RatingStatus.published,
            )
        )
        if other_published is None:
            continue  # still pending on their side
        invite.status = ListenInviteStatus.completed
        invite.responded_at = invite.responded_at or now
        friendship = get_friendship(db, username, other)
        if friendship is not None:
            pairs_to_rebuild.append(friendship.id)

    db.commit()
    for fid in pairs_to_rebuild:
        rebuild_for_pair(db, fid)


def delete_invites_for_user_album(db: Session, username: str, album_id: int) -> None:
    """When a user deletes their rating for an album, withdraw them from every
    invite involving that album — both directions, any status. The album drops
    off their (and their would-be participants') Listen Later list.
    """
    db.execute(
        delete(ListenInvite).where(
            ListenInvite.album_id == album_id,
            or_(
                ListenInvite.sender_username == username,
                ListenInvite.receiver_username == username,
            ),
        )
    )
    db.commit()
