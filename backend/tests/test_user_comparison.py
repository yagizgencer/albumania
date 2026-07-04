"""GET /users/{username}/comparison — live pair comparison between the current
user and any *viewable* user, no friendship required."""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album, BaselineStat
from app.models.rating import Rating, RatingStatus
from app.models.user import ProfileVisibility, User
from app.services.spotify import SpotifyClient, get_spotify_client


@pytest.fixture(autouse=True)
def spotify_mock():
    mock = MagicMock(spec=SpotifyClient)
    mock.get_top5_popular_indices.return_value = [1, 2, 3, 4, 5]
    app.dependency_overrides[get_spotify_client] = lambda: mock
    yield mock
    app.dependency_overrides.pop(get_spotify_client, None)


def _db():
    return next(app.dependency_overrides[get_db]())


def _seed_user(
    username: str, visibility: ProfileVisibility = ProfileVisibility.public
) -> User:
    db = _db()
    u = User(
        username=username,
        email=f"{username}@x.com",
        password_hash="x",
        display_name=username.title(),
        profile_visibility=visibility,
        email_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _seed_album(spotify_id: str = "spot1", total_songs: int = 10) -> int:
    db = _db()
    album = Album(
        spotify_id=spotify_id,
        title=f"Album {spotify_id}",
        artist="Artist",
        release_date="2024-01-01",
        total_songs=total_songs,
    )
    db.add(album)
    db.commit()
    album_id = album.id
    if db.get(BaselineStat, total_songs) is None:
        db.add(BaselineStat(k=total_songs, mean=23.4444, std=7.69))
        db.commit()
    return album_id


def _seed_published_rating(
    username: str, album_id: int, score: float, top: list[int], completed_at: datetime
) -> None:
    db = _db()
    db.add(
        Rating(
            username=username,
            album_id=album_id,
            score=score,
            top_track_indices=top,
            status=RatingStatus.published,
            completed_at=completed_at,
        )
    )
    db.commit()


def _auth_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_auth() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def _send_and_accept(client: TestClient, a: User, b: User) -> int:
    _auth_as(a)
    fid = client.post("/friendships", json={"username": b.username}).json()["id"]
    _clear_auth()
    _auth_as(b)
    client.post(f"/friendships/{fid}/accept")
    _clear_auth()
    return fid


# ---------------------------------------------------------------------------
# Happy path (non-friends)
# ---------------------------------------------------------------------------

def test_public_non_friends_compare_live(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")  # public, NOT a friend
    a1 = _seed_album("spot1")
    a2 = _seed_album("spot2")
    a3 = _seed_album("spot3")

    d1 = datetime(2025, 1, 1, tzinfo=timezone.utc)
    d2 = datetime(2025, 2, 1, tzinfo=timezone.utc)
    d3 = datetime(2025, 3, 1, tzinfo=timezone.utc)

    _seed_published_rating("alice", a1, 8.0, [1, 2, 3, 4, 5], d1)
    _seed_published_rating("alice", a2, 7.0, [1, 2, 3, 4, 5], d2)
    _seed_published_rating("alice", a3, 6.0, [1, 2, 3, 4, 5], d1)
    _seed_published_rating("bob", a1, 9.0, [1, 2, 3, 4, 5], d3)
    _seed_published_rating("bob", a2, 5.0, [5, 4, 3, 2, 1], d2)
    # a3 only rated by alice → not mutual.

    _auth_as(alice)
    r = client.get("/users/bob/comparison")
    assert r.status_code == 200
    data = r.json()
    assert data["friendship_id"] is None
    # The viewer is always user A, so their "you" column is stable.
    assert data["user_a_username"] == "alice"
    assert data["user_b_username"] == "bob"
    assert len(data["entries"]) == 2

    by_id = {e["album"]["spotify_id"]: e for e in data["entries"]}
    e1 = by_id["spot1"]
    assert e1["mutual_date"].startswith("2025-03-01")  # later of d1 / d3
    assert e1["user_a_score"] == 8.0
    assert e1["user_b_score"] == 9.0
    assert e1["mean_score"] == 8.5
    # Identical top 5 → loss 0 → similarity = mean/std
    assert abs(e1["similarity_users"] - (23.4444 / 7.69)) < 1e-4
    _clear_auth()


def test_viewer_is_always_user_a(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album("spot1")
    d = datetime(2025, 1, 1, tzinfo=timezone.utc)
    _seed_published_rating("alice", a1, 8.0, [1, 2, 3, 4, 5], d)
    _seed_published_rating("bob", a1, 4.0, [1, 2, 3, 4, 5], d)

    # bob views alice → bob is A.
    _auth_as(bob)
    data = client.get("/users/alice/comparison").json()
    assert data["user_a_username"] == "bob"
    assert data["user_b_username"] == "alice"
    assert data["entries"][0]["user_a_score"] == 4.0
    assert data["entries"][0]["user_b_score"] == 8.0
    _clear_auth()


def test_no_mutual_albums_returns_empty(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    a1 = _seed_album("spot1")
    _seed_published_rating("alice", a1, 8.0, [1, 2, 3, 4, 5],
                           datetime(2025, 1, 1, tzinfo=timezone.utc))
    # bob rated nothing.
    _auth_as(alice)
    r = client.get("/users/bob/comparison")
    assert r.status_code == 200
    assert r.json()["entries"] == []
    _clear_auth()


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------

def test_cannot_compare_with_self(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.get("/users/alice/comparison")
    assert r.status_code == 400
    _clear_auth()


def test_private_target_forbidden(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob", ProfileVisibility.private)
    _auth_as(alice)
    r = client.get("/users/bob/comparison")
    assert r.status_code == 403
    assert "private" in r.json()["detail"].lower()
    _clear_auth()


def test_friends_only_non_friend_forbidden(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob", ProfileVisibility.friends)
    _auth_as(alice)
    r = client.get("/users/bob/comparison")
    assert r.status_code == 403
    assert "friend" in r.json()["detail"].lower()
    _clear_auth()


def test_friends_only_friend_allowed(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob", ProfileVisibility.friends)
    _send_and_accept(client, alice, bob)
    _auth_as(alice)
    r = client.get("/users/bob/comparison")
    assert r.status_code == 200
    _clear_auth()


def test_unknown_user_404(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.get("/users/ghost/comparison")
    assert r.status_code == 404
    _clear_auth()


def test_comparison_requires_auth(client: TestClient) -> None:
    _seed_user("bob")
    r = client.get("/users/bob/comparison")
    assert r.status_code in (401, 403)
