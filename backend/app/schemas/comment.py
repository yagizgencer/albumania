from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.comment import CommentVisibility

ReactionValue = Literal["up", "down", "none"]


MAX_COMMENT_LEN = 10000


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_COMMENT_LEN)
    visibility: CommentVisibility = CommentVisibility.public


class CommentUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=MAX_COMMENT_LEN)
    visibility: CommentVisibility | None = None


class CommentReactionIn(BaseModel):
    value: ReactionValue


class CommentAuthorOut(BaseModel):
    username: str
    display_name: str
    picture_url: str | None


class CommentOut(BaseModel):
    id: int
    text: str
    visibility: CommentVisibility
    # None when the author's identity is masked from this viewer.
    author: CommentAuthorOut | None
    is_mine: bool
    created_at: datetime
    edited_at: datetime | None
    likes: int
    dislikes: int
    viewer_reaction: Literal["up", "down"] | None


class CommentReactionOut(BaseModel):
    likes: int
    dislikes: int
    viewer_reaction: Literal["up", "down"] | None
