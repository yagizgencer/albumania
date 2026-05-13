from datetime import datetime

from pydantic import BaseModel

from app.models.user import ProfileVisibility


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    display_name: str


class UserResponse(BaseModel):
    username: str
    email: str
    display_name: str
    profile_visibility: ProfileVisibility
    created_at: datetime

    model_config = {"from_attributes": True}
