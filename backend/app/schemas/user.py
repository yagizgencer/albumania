from datetime import datetime

from pydantic import BaseModel, Field

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
    description: str | None
    profile_visibility: ProfileVisibility
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    profile_visibility: ProfileVisibility | None = None
