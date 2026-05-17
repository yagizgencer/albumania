from datetime import datetime

from pydantic import BaseModel

from app.models.friendship import FriendshipStatus


class FriendshipCreate(BaseModel):
    username: str


class FriendshipResponse(BaseModel):
    id: int
    user_a_username: str
    user_b_username: str
    user_a_picture_url: str | None = None
    user_b_picture_url: str | None = None
    status: FriendshipStatus
    requested_by: str
    requested_by_picture_url: str | None = None
    created_at: datetime
    accepted_at: datetime | None

    model_config = {"from_attributes": True}


class FriendshipListResponse(BaseModel):
    incoming: list[FriendshipResponse]
    outgoing: list[FriendshipResponse]
    accepted: list[FriendshipResponse]


class UserSearchResult(BaseModel):
    username: str
    display_name: str
    profile_picture_url: str | None = None

    model_config = {"from_attributes": True}
