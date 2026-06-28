from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_email_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    TokenResponse,
    VerifyEmailRequest,
)
from app.schemas.user import UserCreate
from app.services.email import send_password_changed_email, send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE = "refresh_token"


def _cookie_opts() -> dict:
    secure = get_settings().cookie_secure
    # SameSite=None is required for cross-site cookies (Vercel → Render).
    # SameSite=None mandates Secure=True, so lax is only used in local dev.
    return {"httponly": True, "samesite": "none" if secure else "lax", "secure": secure}


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

    # Soft gate: the user is logged in immediately but must verify their email
    # to unlock social actions. Email send is best-effort.
    send_verification_email(user, create_email_token(user.username))

    response.set_cookie(_REFRESH_COOKIE, create_refresh_token(user.username), **_cookie_opts())
    return TokenResponse(access_token=create_access_token(user.username))


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    user = db.scalar(
        select(User).where(
            or_(User.email == body.identifier, User.username == body.identifier)
        )
    )
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    response.set_cookie(_REFRESH_COOKIE, create_refresh_token(user.username), **_cookie_opts())
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
    response.set_cookie(_REFRESH_COOKIE, create_refresh_token(username), **_cookie_opts())
    return TokenResponse(access_token=create_access_token(username))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    # Browsers only drop a cookie when the deletion matches the attributes it was
    # set with. Without samesite/secure/path the prod (SameSite=None; Secure)
    # cookie survives and the next silent refresh logs the user back in.
    opts = _cookie_opts()
    response.delete_cookie(
        _REFRESH_COOKIE,
        path="/",
        httponly=opts["httponly"],
        samesite=opts["samesite"],
        secure=opts["secure"],
    )


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
def verify_email(
    body: VerifyEmailRequest,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    try:
        payload = decode_token(body.token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired link")
    if payload.get("type") != "email_verify":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token")

    user = db.scalar(select(User).where(User.username == payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Idempotent: clicking the link again after verifying is a no-op.
    if not user.email_verified:
        user.email_verified = True
        db.commit()


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
def resend_verification(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    if current_user.email_verified:
        return
    send_verification_email(current_user, create_email_token(current_user.username))


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    send_password_changed_email(current_user)
