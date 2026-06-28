"""Transactional email.

Sends via the Resend HTTP API when ``resend_api_key`` is configured. In local
dev (no key) it logs the message — including any links — to the console so the
verification / password-change flows are fully testable without an account.

Alternatives considered: SMTP (needs host/credentials wired per environment) and
SendGrid (extra SDK dependency). Resend is a single ``httpx`` POST and already
fits the project's stack, so we use it.
"""

import logging

import httpx

from app.core.config import get_settings
from app.models.user import User

logger = logging.getLogger("albumania.email")

_RESEND_ENDPOINT = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str) -> None:
    settings = get_settings()
    if not settings.resend_api_key:
        logger.info("[email:console] to=%s subject=%s\n%s", to, subject, html)
        return
    try:
        resp = httpx.post(
            _RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "html": html},
            timeout=10.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError:
        # Email is best-effort: a delivery failure must not break signup or a
        # password change. The user can always re-trigger (resend / re-change).
        logger.exception("Failed to send email to %s", to)


def send_verification_email(user: User, token: str) -> None:
    settings = get_settings()
    link = f"{settings.frontend_base_url}/verify-email?token={token}"
    html = (
        f"<p>Hi {user.display_name},</p>"
        f"<p>Confirm your email to unlock friends and listen invites on Albumania.</p>"
        f'<p><a href="{link}">Verify my email</a></p>'
        f"<p>This link expires in 24 hours.</p>"
    )
    send_email(user.email, "Verify your Albumania email", html)


def send_password_changed_email(user: User) -> None:
    html = (
        f"<p>Hi {user.display_name},</p>"
        f"<p>Your Albumania password was just changed. If this wasn't you, "
        f"please reset your password and contact support.</p>"
    )
    send_email(user.email, "Your Albumania password was changed", html)
