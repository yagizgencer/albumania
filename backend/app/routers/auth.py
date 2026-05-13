from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserCreate

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE = "refresh_token"
# secure=False is intentional for local HTTP dev; set True behind HTTPS in prod.
_COOKIE_OPTS: dict = {"httponly": True, "samesite": "lax", "secure": False}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: UserCreate,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    response.set_cookie(_REFRESH_COOKIE, create_refresh_token(user.username), **_COOKIE_OPTS)
    return TokenResponse(access_token=create_access_token(user.username))


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    response.set_cookie(_REFRESH_COOKIE, create_refresh_token(user.username), **_COOKIE_OPTS)
    return TokenResponse(access_token=create_access_token(user.username))


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> TokenResponse:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    try:
        payload = decode_token(refresh_token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    username = payload["sub"]
    response.set_cookie(_REFRESH_COOKIE, create_refresh_token(username), **_COOKIE_OPTS)
    return TokenResponse(access_token=create_access_token(username))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(_REFRESH_COOKIE)
