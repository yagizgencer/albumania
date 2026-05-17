"""Helpers for turning `User.profile_picture_key` into a public URL.

Lives in its own module so the per-request batch lookup is reusable from
the friendship and invite routers (they need to stamp picture URLs onto
every embedded username).
"""
from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.storage import Storage


def picture_url(storage: Storage, key: str | None) -> str | None:
    return storage.public_url(key) if key else None


def picture_url_map(
    db: Session, storage: Storage, usernames: Iterable[str]
) -> dict[str, str | None]:
    """One-shot `username -> public_url` lookup. Returns None for usernames
    with no avatar; callers can serialise that straight into JSON null."""
    names = list({u for u in usernames if u})
    if not names:
        return {}
    rows = db.execute(
        select(User.username, User.profile_picture_key).where(User.username.in_(names))
    ).all()
    return {username: picture_url(storage, key) for username, key in rows}
