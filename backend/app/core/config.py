from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The out-of-the-box JWT secret. Fine for local dev; a security hole in prod
# (anyone who knows it can forge tokens), so `_guard_prod_secrets` rejects it there.
INSECURE_JWT_DEFAULT = "dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./albumania.db"
    jwt_secret: str = INSECURE_JWT_DEFAULT
    jwt_access_ttl_minutes: int = 15
    jwt_refresh_ttl_days: int = 30
    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    cors_origins: str = "http://localhost:5173"

    # Profile-picture storage. "local" writes to backend/static/avatars (mounted at
    # /static); "r2" uses Cloudflare R2 via the S3 API.
    storage_backend: str = "local"
    api_base_url: str = "http://localhost:8000"
    # Root directory for FastAPI's StaticFiles mount when STORAGE_BACKEND=local.
    # Avatar keys are prefixed `avatars/...` and land under this dir.
    static_dir: str = "static"
    avatar_max_bytes: int = 2 * 1024 * 1024
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    r2_public_url_base: str = ""

    # Set to true in production (Render). Enables Secure + SameSite=None so
    # the httpOnly refresh cookie is sent on cross-site requests (Vercel → Render).
    cookie_secure: bool = False

    # Transactional email via Resend (https://resend.com). When resend_api_key is
    # empty (local dev) the email service logs the message to the console instead
    # of sending, so the flow is testable without an account or key.
    resend_api_key: str = ""
    email_from: str = "Albumania <onboarding@resend.dev>"
    # Public base URL of the frontend, used to build links inside emails.
    frontend_base_url: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def _guard_prod_secrets(self) -> "Settings":
        # cookie_secure is only true in production (Render), so it doubles as a
        # "this is prod" signal. Booting prod with the default dev secret would
        # let anyone forge JWTs — fail fast instead of shipping it. Local dev and
        # tests leave cookie_secure=False, so this is a no-op there.
        if self.cookie_secure and self.jwt_secret == INSECURE_JWT_DEFAULT:
            raise ValueError(
                "JWT_SECRET must be set to a real secret in production "
                "(cookie_secure is true but JWT_SECRET is still the dev default)."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
