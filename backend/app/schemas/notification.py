from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.notification import NotificationType
from app.schemas.album import AlbumOut


class NotificationSummary(BaseModel):
    bell: int
    listen_invites: int
    friend_requests: int


class NotificationItem(BaseModel):
    id: int
    type: NotificationType
    actor_username: str | None
    actor_picture_url: str | None
    friendship_id: int | None
    invite_id: int | None
    album: AlbumOut | None
    read: bool
    created_at: datetime


class MarkSeenRequest(BaseModel):
    scope: Literal["bell", "listen_invites", "friend_requests"]


class MarkSeenResponse(BaseModel):
    updated: int
