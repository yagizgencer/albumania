from datetime import datetime

from pydantic import BaseModel

from app.models.friendship import FriendshipStatus
from app.models.user import ProfileVisibility


class FriendshipCreate(BaseModel):
    username: str


class FriendshipResponse(BaseModel):
    id: int
    user_a_username: str
    user_b_username: str
    user_a_picture_url: str | None = None
    user_b_picture_url: str | None = None
    # Each side's profile visibility, so the UI can flag a private friend (e.g. a
    # lock icon on the "compare with" picker). Optional: only the list endpoint
    # populates these.
    user_a_visibility: ProfileVisibility | None = None
    user_b_visibility: ProfileVisibility | None = None
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
    profile_visibility: ProfileVisibility

    model_config = {"from_attributes": True}
