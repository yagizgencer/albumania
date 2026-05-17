"""Profile picture upload / replace / delete + propagation to friendship
and invite payloads. Uses InMemoryStorage (injected via conftest) so we
can snapshot what was uploaded and what got deleted."""

from io import BytesIO

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.user import User


def _db():
    return next(app.dependency_overrides[get_db]())


def _seed_user(username: str) -> User:
    db = _db()
    u = User(
        username=username,
        email=f"{username}@x.com",
        password_hash="x",
        display_name=username.title(),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _auth_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_auth() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def _png_bytes() -> bytes:
    # 1×1 transparent PNG.
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8"
        b"\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\xff\xfb\xa3\xa3\x00\x00\x00"
        b"\x00IEND\xaeB`\x82"
    )


@pytest.mark.usefixtures("client")
def test_upload_avatar_happy_path(client: TestClient, storage):
    alice = _seed_user("alice")
    _auth_as(alice)
    files = {"file": ("a.png", BytesIO(_png_bytes()), "image/png")}
    r = client.post("/users/me/avatar", files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["profile_picture_url"] is not None
    assert data["profile_picture_url"].startswith("http://test/avatars/avatars/alice-")
    # Stored on the user row.
    assert _db().get(User, alice.id).profile_picture_key is not None
    # Stored bytes match what we sent.
    [key] = list(storage.objects.keys())
    assert storage.objects[key] == _png_bytes()
    assert storage.content_types[key] == "image/png"
    _clear_auth()


def test_upload_avatar_replaces_old_object(client: TestClient, storage):
    alice = _seed_user("alice")
    _auth_as(alice)
    client.post("/users/me/avatar", files={"file": ("a.png", BytesIO(_png_bytes()), "image/png")})
    first_key = next(iter(storage.objects))
    # Upload again — old object must be deleted, new one stored.
    client.post("/users/me/avatar", files={"file": ("b.png", BytesIO(_png_bytes()), "image/png")})
    assert first_key not in storage.objects
    assert len(storage.objects) == 1
    _clear_auth()


def test_upload_rejects_wrong_content_type(client: TestClient):
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.post(
        "/users/me/avatar",
        files={"file": ("a.pdf", BytesIO(b"%PDF-1.4"), "application/pdf")},
    )
    assert r.status_code == 415
    _clear_auth()


def test_upload_rejects_oversized(client: TestClient):
    alice = _seed_user("alice")
    _auth_as(alice)
    big = b"\x00" * (2 * 1024 * 1024 + 1)
    r = client.post(
        "/users/me/avatar",
        files={"file": ("a.png", BytesIO(big), "image/png")},
    )
    assert r.status_code == 413
    _clear_auth()


def test_upload_requires_auth(client: TestClient):
    r = client.post(
        "/users/me/avatar",
        files={"file": ("a.png", BytesIO(_png_bytes()), "image/png")},
    )
    assert r.status_code in (401, 403)


def test_delete_avatar_clears_key_and_object(client: TestClient, storage):
    alice = _seed_user("alice")
    _auth_as(alice)
    client.post("/users/me/avatar", files={"file": ("a.png", BytesIO(_png_bytes()), "image/png")})
    assert storage.objects
    r = client.delete("/users/me/avatar")
    assert r.status_code == 204
    assert not storage.objects
    assert _db().get(User, alice.id).profile_picture_key is None
    _clear_auth()


def test_get_user_returns_picture_url(client: TestClient):
    alice = _seed_user("alice")
    _seed_user("bob")
    _auth_as(alice)
    client.post("/users/me/avatar", files={"file": ("a.png", BytesIO(_png_bytes()), "image/png")})
    r = client.get("/users/alice")
    assert r.status_code == 200
    assert r.json()["profile_picture_url"] is not None

    # bob has no avatar — null on his payload
    r = client.get("/users/bob")
    assert r.status_code == 200
    assert r.json()["profile_picture_url"] is None
    _clear_auth()


def test_friendship_and_invite_payloads_carry_picture_urls(client: TestClient):
    from app.models.album import Album, BaselineStat

    alice = _seed_user("alice")
    bob = _seed_user("bob")
    db = _db()
    album = Album(
        spotify_id="spot1",
        title="A",
        artist="Artist",
        release_date="2024-01-01",
        total_songs=10,
    )
    db.add(album)
    db.add(BaselineStat(k=10, mean=23.4, std=7.7))
    db.commit()
    album_id = album.id

    _auth_as(alice)
    client.post("/users/me/avatar", files={"file": ("a.png", BytesIO(_png_bytes()), "image/png")})
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/friendships/{fid}/accept")
    _clear_auth()

    # Friendship list payload: alice has a URL, bob is null.
    _auth_as(bob)
    payload = client.get("/friendships/me").json()
    f = payload["accepted"][0]
    assert f["user_a_picture_url"] is not None
    assert f["user_b_picture_url"] is None

    # Send + accept an invite, verify URLs flow through.
    iid = client.post("/invites", json={"username": "alice", "album_id": album_id}).json()["id"]
    inv = client.get("/invites/me").json()
    found = next(i for i in inv["outgoing"] if i["id"] == iid)
    assert found["sender_picture_url"] is None  # bob = sender, no avatar
    assert found["receiver_picture_url"] is not None  # alice has one
    _clear_auth()
