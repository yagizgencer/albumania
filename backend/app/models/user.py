import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ProfileVisibility(str, enum.Enum):
    public = "public"
    friends = "friends"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    profile_picture_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    profile_visibility: Mapped[ProfileVisibility] = mapped_column(
        Enum(ProfileVisibility), nullable=False, default=ProfileVisibility.public
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
