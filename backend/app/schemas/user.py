import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.user import ProfileVisibility

# Username: 5–20 chars of letters, digits, "." and "_". No spaces/other symbols.
# Kept in one place so the message and the rule can't drift apart. Usernames go
# into URLs (/profile/<username>), so this also hardens routing.
USERNAME_RE = re.compile(r"^[a-zA-Z0-9._]{5,20}$")
# Pragmatic email-format check (one "@", a dot in the domain, no spaces). Real
# deliverability is proven by the verification email, not this regex. Using a
# regex instead of the `email-validator` package to avoid a new dependency.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserCreate(BaseModel):
    username: str
    email: str
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)

    @field_validator("username")
    @classmethod
    def _valid_username(cls, v: str) -> str:
        if not USERNAME_RE.fullmatch(v):
            raise ValueError(
                "Username must be 5–20 characters and use only letters, numbers, "
                "periods (.) and underscores (_)."
            )
        return v

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip()
        if not EMAIL_RE.fullmatch(v) or len(v) > 254:
            raise ValueError("Enter a valid email address.")
        return v.lower()


class UserResponse(BaseModel):
    username: str
    email: str
    email_verified: bool
    display_name: str
    description: str | None
    profile_visibility: ProfileVisibility
    profile_picture_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    profile_visibility: ProfileVisibility | None = None
