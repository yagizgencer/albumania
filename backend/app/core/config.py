from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./albumania.db"
    jwt_secret: str = "dev-secret-change-me"
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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
