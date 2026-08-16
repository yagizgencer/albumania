"""Tests for the /media/{key} proxy route — serves object storage reads
through the backend rather than a storage backend's own public URL. No
auth test: this is deliberately public, matching the original bucket's
public-read access (avatars must be viewable on other users' profiles,
and email clients load the brand logo with no auth at all)."""
from fastapi.testclient import TestClient


def _png_bytes() -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
        b"\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\xff\xfb\xa3\xa3\x00\x00\x00"
        b"\x00IEND\xaeB`\x82"
    )


def test_get_media_returns_stored_bytes(client: TestClient, storage):
    storage.save("brand/test.png", _png_bytes(), "image/png")
    r = client.get("/media/brand/test.png")
    assert r.status_code == 200
    assert r.content == _png_bytes()
    assert r.headers["content-type"] == "image/png"


def test_get_media_missing_key_returns_404(client: TestClient):
    r = client.get("/media/does/not/exist.png")
    assert r.status_code == 404
