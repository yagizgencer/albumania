from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.models.notification import Notification

from app.core.album_rules import require_rateable
from app.core.deps import get_current_user, get_verified_user
from app.db.session import get_db
from app.models.album import Album
from app.models.invite import ListenInvite, ListenInviteStatus
from app.models.rating import Rating, RatingStatus
from app.models.user import ProfileVisibility, User
from app.schemas.album import AlbumOut, TrackOut
from app.schemas.invite import (
    ListenInviteCreate,
    ListenInviteListResponse,
    ListenInviteOut,
    ListenInviteWithAlbum,
    ListenLaterEntry,
    ListenLaterParticipant,
)
from app.models.notification import NotificationType
from app.services.avatars import picture_url_map
from app.services.friendship import are_friends
from app.services.notifications import create_notification
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/invites", tags=["invites"])

CurrentUser = Annotated[User, Depends(get_current_user)]
VerifiedUser = Annotated[User, Depends(get_verified_user)]
DB = Annotated[Session, Depends(get_db)]
StorageDep = Annotated[Storage, Depends(get_storage)]


def _invite_out(invite: ListenInvite, urls: dict[str, str | None]) -> ListenInviteOut:
    return ListenInviteOut(
        id=invite.id,
        sender_username=invite.sender_username,
        receiver_username=invite.receiver_username,
        sender_picture_url=urls.get(invite.sender_username),
        receiver_picture_url=urls.get(invite.receiver_username),
        album_id=invite.album_id,
        status=invite.status,
        created_at=invite.created_at,
        responded_at=invite.responded_at,
    )


def _album_out(album: Album) -> AlbumOut:
    return AlbumOut(
        id=album.id,
        spotify_id=album.spotify_id,
        title=album.title,
        artist=album.artist,
        artist_spotify_id=album.artist_spotify_id,
        release_date=album.release_date,
        total_songs=album.total_songs,
        album_art_url=album.album_art_url,
        tracks=[
            TrackOut(
                index=t.index,
                name=t.name,
                spotify_url=t.spotify_url,
                duration_ms=t.duration_ms,
            )
            for t in album.tracks
        ],
    )


@router.post("", response_model=ListenInviteOut, status_code=status.HTTP_201_CREATED)
def create_invite(
    body: ListenInviteCreate, user: VerifiedUser, db: DB, storage: StorageDep
) -> ListenInviteOut:
    if body.username == user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot invite yourself"
        )

    receiver = db.scalar(select(User).where(User.username == body.username))
    if receiver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not are_friends(db, user.username, receiver.username):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not friends with this user"
        )

    album = db.scalar(select(Album).where(Album.id == body.album_id))
    if album is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    require_rateable(album)

    # Receiver must not have already published a rating for this album.
    receiver_published = db.scalar(
        select(Rating).where(
            Rating.username == receiver.username,
            Rating.album_id == album.id,
            Rating.status == RatingStatus.published,
        )
    )
    if receiver_published is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{receiver.username} has already published a rating for this album",
        )

    # No duplicate invite between this pair for this album, either direction.
    duplicate = db.scalar(
        select(ListenInvite).where(
            ListenInvite.album_id == album.id,
            or_(
                (ListenInvite.sender_username == user.username)
                & (ListenInvite.receiver_username == receiver.username),
                (ListenInvite.sender_username == receiver.username)
                & (ListenInvite.receiver_username == user.username),
            ),
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invite for this album already exists between you two",
        )

    invite = ListenInvite(
        sender_username=user.username,
        receiver_username=receiver.username,
        album_id=album.id,
        status=ListenInviteStatus.pending,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    create_notification(
        db,
        recipient_username=invite.receiver_username,
        type=NotificationType.listen_invite,
        actor_username=invite.sender_username,
        invite_id=invite.id,
        album_id=invite.album_id,
    )
    db.commit()
    urls = picture_url_map(db, storage, [invite.sender_username, invite.receiver_username])
    return _invite_out(invite, urls)


def _get_invite_or_404(db: Session, invite_id: int) -> ListenInvite:
    invite = db.get(ListenInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    return invite


@router.post("/{invite_id}/accept", response_model=ListenInviteOut)
def accept_invite(
    invite_id: int, user: CurrentUser, db: DB, storage: StorageDep
) -> ListenInviteOut:
    invite = _get_invite_or_404(db, invite_id)
    if invite.receiver_username != user.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your invite to accept"
        )
    if invite.status != ListenInviteStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is not pending"
        )
    invite.status = ListenInviteStatus.accepted
    invite.responded_at = datetime.now(timezone.utc)
    # The accepter's own listen_invite notification is resolved.
    db.execute(
        update(Notification)
        .where(
            Notification.recipient_username == user.username,
            Notification.invite_id == invite.id,
            Notification.type == NotificationType.listen_invite,
        )
        .values(read=True)
    )
    db.commit()
    db.refresh(invite)
    urls = picture_url_map(db, storage, [invite.sender_username, invite.receiver_username])
    return _invite_out(invite, urls)


@router.post("/{invite_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_invite(invite_id: int, user: CurrentUser, db: DB) -> None:
    invite = _get_invite_or_404(db, invite_id)
    if invite.receiver_username != user.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your invite to decline"
        )
    if invite.status != ListenInviteStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is not pending"
        )
    db.delete(invite)
    db.commit()


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_invite(invite_id: int, user: CurrentUser, db: DB) -> None:
    invite = _get_invite_or_404(db, invite_id)
    if invite.sender_username != user.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not your invite to cancel"
        )
    if invite.status != ListenInviteStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is not pending"
        )
    db.delete(invite)
    db.commit()


@router.get("/me", response_model=ListenInviteListResponse)
def list_my_invites(
    user: CurrentUser, db: DB, storage: StorageDep
) -> ListenInviteListResponse:
    me = user.username
    rows = db.scalars(
        select(ListenInvite).where(
            ListenInvite.status == ListenInviteStatus.pending,
            or_(ListenInvite.sender_username == me, ListenInvite.receiver_username == me),
        )
    ).all()

    album_ids = {r.album_id for r in rows}
    album_map: dict[int, Album] = {}
    if album_ids:
        for album in db.scalars(select(Album).where(Album.id.in_(album_ids))):
            album_map[album.id] = album

    urls = picture_url_map(
        db,
        storage,
        {u for r in rows for u in (r.sender_username, r.receiver_username)},
    )

    def to_out(invite: ListenInvite) -> ListenInviteWithAlbum:
        album = album_map[invite.album_id]
        return ListenInviteWithAlbum(
            id=invite.id,
            sender_username=invite.sender_username,
            receiver_username=invite.receiver_username,
            sender_picture_url=urls.get(invite.sender_username),
            receiver_picture_url=urls.get(invite.receiver_username),
            album_id=invite.album_id,
            status=invite.status,
            created_at=invite.created_at,
            responded_at=invite.responded_at,
            album=_album_out(album),
        )

    incoming: list[ListenInviteWithAlbum] = []
    outgoing: list[ListenInviteWithAlbum] = []
    for r in rows:
        out = to_out(r)
        if r.sender_username == me:
            outgoing.append(out)
        else:
            incoming.append(out)

    return ListenInviteListResponse(incoming=incoming, outgoing=outgoing)


# Listen Later view ----------------------------------------------------------

listen_later_router = APIRouter(prefix="/listen-later", tags=["listen-later"])


@listen_later_router.get("", response_model=list[ListenLaterEntry])
def get_listen_later(
    user: CurrentUser, db: DB, storage: StorageDep
) -> list[ListenLaterEntry]:
    me = user.username

    # Drafts owned by me.
    drafts = list(
        db.scalars(
            select(Rating)
            .options(selectinload(Rating.notes))
            .where(Rating.username == me, Rating.status == RatingStatus.draft)
        )
    )
    drafts_by_album: dict[int, Rating] = {r.album_id: r for r in drafts}

    # Invites that contribute a "participant chip" for me on some album. Used
    # for participant rendering — NOT for deciding whether to create a row.
    #   - any non-completed invite I sent (outgoing), pending or accepted
    #   - any non-completed invite where I'm the receiver AND have accepted
    relevant_invites = list(
        db.scalars(
            select(ListenInvite).where(
                ListenInvite.status != ListenInviteStatus.completed,
                or_(
                    ListenInvite.sender_username == me,
                    (ListenInvite.receiver_username == me)
                    & (ListenInvite.status == ListenInviteStatus.accepted),
                ),
            )
        )
    )

    # Build participants per album for me.
    participants_by_album: dict[int, list[ListenInvite]] = {}
    for inv in relevant_invites:
        participants_by_album.setdefault(inv.album_id, []).append(inv)

    # An album only gets a row when *I* have committed to listening: I have a
    # draft, OR at least one of the related invites is `accepted` (either I sent
    # one and they accepted, or they sent one and I accepted). Purely-pending
    # outgoing invites do NOT add a row — they live in /invites/me.outgoing
    # until the receiver responds.
    entry_album_ids: set[int] = set(drafts_by_album)
    for album_id, invs in participants_by_album.items():
        if any(i.status == ListenInviteStatus.accepted for i in invs):
            entry_album_ids.add(album_id)

    if not entry_album_ids:
        return []
    albums = list(db.scalars(select(Album).where(Album.id.in_(entry_album_ids))))
    album_map = {a.id: a for a in albums}

    # For the "they_published" flag, lookup published ratings for the other
    # parties on these albums.
    other_users = {
        inv.receiver_username if inv.sender_username == me else inv.sender_username
        for invs in participants_by_album.values()
        for inv in invs
    }
    published_pairs: set[tuple[str, int]] = set()
    if other_users:
        # Skip private users: the "they published" flag would otherwise reveal
        # that a private friend has rated a shared album. (Friends-only is fine —
        # a Listen Later invite already implies an accepted friendship.)
        for r in db.scalars(
            select(Rating)
            .join(User, User.username == Rating.username)
            .where(
                Rating.status == RatingStatus.published,
                Rating.username.in_(other_users),
                Rating.album_id.in_(entry_album_ids),
                User.profile_visibility != ProfileVisibility.private,
            )
        ):
            published_pairs.add((r.username, r.album_id))

    # Exclude albums where I've already published — those don't belong in Listen Later.
    my_published = {
        r.album_id
        for r in db.scalars(
            select(Rating).where(
                Rating.username == me,
                Rating.status == RatingStatus.published,
                Rating.album_id.in_(entry_album_ids),
            )
        )
    }

    participant_urls = picture_url_map(db, storage, other_users)

    entries: list[ListenLaterEntry] = []
    for album_id in entry_album_ids:
        if album_id in my_published:
            continue
        album = album_map[album_id]
        rating = drafts_by_album.get(album_id)
        participants: list[ListenLaterParticipant] = []
        for inv in participants_by_album.get(album_id, []):
            if inv.sender_username == me:
                other = inv.receiver_username
                direction = "outgoing"
            else:
                other = inv.sender_username
                direction = "incoming"
            participants.append(
                ListenLaterParticipant(
                    username=other,
                    picture_url=participant_urls.get(other),
                    direction=direction,
                    invite_status=inv.status,
                    they_published=(other, album_id) in published_pairs,
                )
            )

        # If there's no draft AND no qualifying participants, skip (shouldn't happen).
        if rating is None and not participants:
            continue

        entries.append(
            ListenLaterEntry(
                album=_album_out(album),
                rating=rating,  # pydantic from_attributes will pick this up via RatingOut
                participants=participants,
            )
        )

    # Sort newest-first by either rating start or invite creation.
    def _sort_key(entry: ListenLaterEntry) -> datetime:
        if entry.rating is not None:
            return entry.rating.started_at
        # safe: participants is non-empty here
        invs = participants_by_album[entry.album.id]
        return max(i.created_at for i in invs)

    entries.sort(key=_sort_key, reverse=True)
    return entries
