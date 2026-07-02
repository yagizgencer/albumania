"""Transactional email.

Sends via the Resend HTTP API when ``resend_api_key`` is configured. In local
dev (no key) it logs the message — including any links — to the console so the
verification / password-reset flows are fully testable without an account.

Alternatives considered: SMTP (needs host/credentials wired per environment) and
SendGrid (extra SDK dependency). Resend is a single ``httpx`` POST and already
fits the project's stack, so we use it.

Emails use one shared branded HTML shell (``_layout``) with inline styles —
email clients strip <style> tags, so all styling must be inline.
"""

import logging
from html import escape

import httpx

from app.core.config import get_settings
from app.models.user import User
from app.services.storage import get_storage

logger = logging.getLogger("albumania.email")

_RESEND_ENDPOINT = "https://api.resend.com/emails"

# The brand logo lives in object storage (R2) so emails can load it by a stable
# public URL from any environment. Upload it with scripts/upload_brand_assets.py.
BRAND_LOGO_KEY = "brand/albumania_icon.png"

# Palette mirrors the app's sketchbook theme so emails feel on-brand.
_PAPER = "#fdf4e7"
_SURFACE = "#fffdf8"
_INK = "#3a322a"
_MUTED = "#6f6457"
_BORDER = "#3a342e"
_LAVENDER = "#cdc1ff"


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
        # password reset. The user can always re-trigger.
        logger.exception("Failed to send email to %s", to)


def _button(label: str, href: str) -> str:
    return (
        f'<a href="{escape(href, quote=True)}" '
        f'style="display:inline-block;background:{_LAVENDER};color:{_INK};'
        f"text-decoration:none;font-weight:700;padding:12px 28px;border-radius:12px;"
        f'border:2px solid {_BORDER};box-shadow:3px 3px 0 rgba(58,52,46,0.18);">'
        f"{escape(label)}</a>"
    )


def _layout(*, heading: str, intro_html: str, button: str = "", footer_html: str = "") -> str:
    """Wrap email body content in the shared branded shell."""
    # The site logo, referenced by its object-storage public URL so email
    # clients can load it from any environment (relative/local paths don't work
    # in email). Uploaded via scripts/upload_brand_assets.py.
    logo_url = get_storage().public_url(BRAND_LOGO_KEY)
    return f"""\
<div style="margin:0;padding:24px;background:{_PAPER};
    font-family:'Nunito','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:{_INK};">
  <div style="max-width:480px;margin:0 auto;background:{_SURFACE};
      border:2px solid {_BORDER};border-radius:20px;overflow:hidden;
      box-shadow:4px 4px 0 rgba(58,52,46,0.16);">
    <div style="padding:16px 32px;border-bottom:2px solid {_BORDER};">
      <img src="{escape(logo_url, quote=True)}" alt="Albumania" width="64" height="64"
        style="vertical-align:middle;margin-right:12px;" />
      <span style="font-size:26px;font-weight:800;letter-spacing:0.01em;
        vertical-align:middle;">Albumania</span>
    </div>
    <div style="padding:28px 32px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:{_INK};">{escape(heading)}</h1>
      <div style="font-size:15px;line-height:1.6;color:{_INK};">{intro_html}</div>
      {f'<div style="margin:24px 0;">{button}</div>' if button else ''}
      {f'<div style="font-size:13px;line-height:1.5;color:{_MUTED};margin-top:20px;">{footer_html}</div>' if footer_html else ''}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e8dcc6;
        font-size:12px;color:{_MUTED};">
      Rate albums, rank your top tracks, and compare your taste with friends.
    </div>
  </div>
</div>"""


def send_verification_email(user: User, token: str) -> None:
    settings = get_settings()
    link = f"{settings.frontend_base_url}/verify-email?token={token}"
    name = escape(user.display_name)
    html = _layout(
        heading="Confirm your email",
        intro_html=(
            f"<p style='margin:0 0 8px;'>Hi {name},</p>"
            "<p style='margin:0;'>Confirm your email to unlock friends and listen "
            "invites on Albumania.</p>"
        ),
        button=_button("Verify my email", link),
        footer_html=(
            "This link expires in 24 hours. If you didn’t create an account, "
            "you can ignore this email."
        ),
    )
    send_email(user.email, "Verify your Albumania email", html)


def send_password_reset_email(user: User, token: str) -> None:
    settings = get_settings()
    link = f"{settings.frontend_base_url}/reset-password?token={token}"
    name = escape(user.display_name)
    html = _layout(
        heading="Reset your password",
        intro_html=(
            f"<p style='margin:0 0 8px;'>Hi {name},</p>"
            "<p style='margin:0;'>We received a request to reset your Albumania "
            "password. Click the button below to choose a new one.</p>"
        ),
        button=_button("Reset my password", link),
        footer_html=(
            "This link expires in 1 hour. If you didn’t request a reset, you can "
            "safely ignore this email — your password won’t change."
        ),
    )
    send_email(user.email, "Reset your Albumania password", html)


def send_password_changed_email(user: User) -> None:
    name = escape(user.display_name)
    html = _layout(
        heading="Your password was changed",
        intro_html=(
            f"<p style='margin:0 0 8px;'>Hi {name},</p>"
            "<p style='margin:0;'>Your Albumania password was just changed.</p>"
        ),
        footer_html=(
            "If this wasn’t you, reset your password immediately and contact support."
        ),
    )
    send_email(user.email, "Your Albumania password was changed", html)
