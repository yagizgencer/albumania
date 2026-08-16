"""Profile picture storage. One protocol, three backends.

`LocalStorage` writes under `settings.avatar_dir` (served by FastAPI's
StaticFiles mount). `R2Storage` talks to Cloudflare R2 via the S3 API
(boto3). `InMemoryStorage` is for tests; it stores bytes in a dict so
assertions can verify what was uploaded / deleted without touching disk
or network.
"""
from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Protocol

from app.core.config import Settings, get_settings


class ObjectNotFoundError(Exception):
    """Raised by `Storage.get()` when `key` doesn't exist, regardless of
    backend — callers (the `/media` route) don't need to know whether that
    means a missing file, a missing dict entry, or an S3 404."""


class Storage(Protocol):
    def save(self, key: str, data: bytes, content_type: str) -> str: ...
    def delete(self, key: str) -> None: ...
    def public_url(self, key: str) -> str: ...
    def get(self, key: str) -> tuple[bytes, str]: ...


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

    def get(self, key: str) -> tuple[bytes, str]:
        path = self._dir / key
        try:
            data = path.read_bytes()
        except FileNotFoundError as exc:
            raise ObjectNotFoundError(key) from exc
        content_type, _ = mimetypes.guess_type(key)
        return data, content_type or "application/octet-stream"


class R2Storage:
    """Cloudflare R2 via boto3 (S3-compatible).

    Public URLs are proxied through our own `/media/{key}` route instead of
    pointing directly at R2's `pub-xxx.r2.dev` domain. Some ISPs block that
    domain outright at the network level (observed with a Turkish ISP: the
    TLS handshake gets hijacked into a plain-HTTP redirect to a landing
    page) — routing reads through our own already-reachable domain avoids
    that entirely, at the cost of one extra hop through the backend per
    image load. Fine at this app's scale.
    """

    def __init__(self, settings: Settings):
        import boto3  # local import so test envs don't need boto3 configured

        if not (
            settings.r2_account_id
            and settings.r2_access_key_id
            and settings.r2_secret_access_key
            and settings.r2_bucket
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
        self._api_base = settings.api_base_url.rstrip("/")

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
        return f"{self._api_base}/media/{key}"

    def get(self, key: str) -> tuple[bytes, str]:
        from botocore.exceptions import ClientError

        try:
            obj = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            raise ObjectNotFoundError(key) from exc
        return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")


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

    def get(self, key: str) -> tuple[bytes, str]:
        try:
            return self.objects[key], self.content_types[key]
        except KeyError as exc:
            raise ObjectNotFoundError(key) from exc


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
