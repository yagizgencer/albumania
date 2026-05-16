from datetime import datetime

from pydantic import BaseModel

from app.models.invite import ListenInviteStatus
from app.schemas.album import AlbumOut
from app.schemas.rating import RatingOut


class ListenInviteCreate(BaseModel):
    username: str
    album_id: int


class ListenInviteOut(BaseModel):
    id: int
    sender_username: str
    receiver_username: str
    album_id: int
    status: ListenInviteStatus
    created_at: datetime
    responded_at: datetime | None

    model_config = {"from_attributes": True}


class ListenInviteWithAlbum(ListenInviteOut):
    album: AlbumOut


class ListenInviteListResponse(BaseModel):
    incoming: list[ListenInviteWithAlbum]
    outgoing: list[ListenInviteWithAlbum]


class ListenLaterParticipant(BaseModel):
    """One friend I'm sharing this album with."""

    username: str
    direction: str  # "outgoing" (I sent the invite) | "incoming" (they sent it)
    invite_status: ListenInviteStatus
    they_published: bool


class ListenLaterEntry(BaseModel):
    """Single row on the Listen Later page. Empty `participants` = solo draft."""

    album: AlbumOut
    rating: RatingOut | None
    participants: list[ListenLaterParticipant]
