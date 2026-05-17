"""Profile picture storage. One protocol, three backends.

`LocalStorage` writes under `settings.avatar_dir` (served by FastAPI's
StaticFiles mount). `R2Storage` talks to Cloudflare R2 via the S3 API
(boto3). `InMemoryStorage` is for tests; it stores bytes in a dict so
assertions can verify what was uploaded / deleted without touching disk
or network.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from app.core.config import Settings, get_settings


class Storage(Protocol):
    def save(self, key: str, data: bytes, content_type: str) -> str: ...
    def delete(self, key: str) -> None: ...
    def public_url(self, key: str) -> str: ...


class LocalStorage:
    """Writes to disk under `settings.static_dir`. Keys carry their own
    prefix (e.g. `avatars/alice-…png`) so files land at
    `static/avatars/alice-…png` and the URL is `/static/avatars/alice-…png`.

    Files vanish on every Render redeploy — only use this locally.
    """

    def __init__(self, settings: Settings):
        self._dir = Path(settings.static_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._api_base = settings.api_base_url.rstrip("/")

    def save(self, key: str, data: bytes, content_type: str) -> str:
        path = self._dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return self.public_url(key)

    def delete(self, key: str) -> None:
        path = self._dir / key
        if path.exists():
            path.unlink()

    def public_url(self, key: str) -> str:
        return f"{self._api_base}/static/{key}"


class R2Storage:
    """Cloudflare R2 via boto3 (S3-compatible).

    The bucket must be configured for public-read access (avatars are
    inherently semi-public). The public URL pattern is `r2_public_url_base`
    + `/` + key — point that at either R2's auto-assigned `r2.dev` URL or a
    custom domain bound to the bucket.
    """

    def __init__(self, settings: Settings):
        import boto3  # local import so test envs don't need boto3 configured

        if not (
            settings.r2_account_id
            and settings.r2_access_key_id
            and settings.r2_secret_access_key
            and settings.r2_bucket
            and settings.r2_public_url_base
        ):
            raise RuntimeError(
                "STORAGE_BACKEND=r2 but R2 settings are incomplete"
            )

        endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            region_name="auto",
        )
        self._bucket = settings.r2_bucket
        self._public_base = settings.r2_public_url_base.rstrip("/")

    def save(self, key: str, data: bytes, content_type: str) -> str:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return self.public_url(key)

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def public_url(self, key: str) -> str:
        return f"{self._public_base}/{key}"


class InMemoryStorage:
    """Test backend. Holds bytes + content types in dicts so tests can
    snapshot uploads and verify deletes."""

    def __init__(self, public_base: str = "http://test/avatars") -> None:
        self.objects: dict[str, bytes] = {}
        self.content_types: dict[str, str] = {}
        self._public_base = public_base.rstrip("/")

    def save(self, key: str, data: bytes, content_type: str) -> str:
        self.objects[key] = data
        self.content_types[key] = content_type
        return self.public_url(key)

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)
        self.content_types.pop(key, None)

    def public_url(self, key: str) -> str:
        return f"{self._public_base}/{key}"


def _build_storage(settings: Settings) -> Storage:
    backend = settings.storage_backend.lower()
    if backend == "r2":
        return R2Storage(settings)
    if backend == "local":
        return LocalStorage(settings)
    raise RuntimeError(f"Unknown STORAGE_BACKEND: {settings.storage_backend!r}")


_storage_singleton: Storage | None = None


def get_storage() -> Storage:
    """FastAPI dependency. Lazily constructs the chosen backend once."""
    global _storage_singleton
    if _storage_singleton is None:
        _storage_singleton = _build_storage(get_settings())
    return _storage_singleton
