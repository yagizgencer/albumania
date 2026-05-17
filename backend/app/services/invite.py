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
    accepted invite that involves them:
      - if the other party has also published, flip to `completed` and rebuild
        that friend-pair's dashboard.
      - otherwise, drop a `friend_published` notification on the other party
        ("alice rated this — your turn").
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
        other = (
            invite.receiver_username
            if invite.sender_username == username
            else invite.sender_username
        )
        other_published = db.scalar(
            select(Rating).where(
                Rating.username == other,
                Rating.album_id == album_id,
                Rating.status == RatingStatus.published,
            )
        )
        if other_published is None:
            # Only fires when the *other* party has already accepted — a pending
            # outgoing invite the other side hasn't responded to yet isn't a
            # shared listen yet, so skip.
            if invite.status == ListenInviteStatus.accepted:
                create_notification(
                    db,
                    recipient_username=other,
                    type=NotificationType.friend_published,
                    actor_username=username,
                    invite_id=invite.id,
                    album_id=album_id,
                )
            continue
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
