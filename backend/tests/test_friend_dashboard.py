from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album, BaselineStat
from app.models.friendship import FriendDashboardEntry, Friendship, FriendshipStatus
from app.models.rating import Rating, RatingStatus
from app.models.user import User
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
    username: str,
    album_id: int,
    score: float,
    top: list[int],
    completed_at: datetime,
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


def _accept_friendship(initiator: User, target: User) -> int:
    _auth_as(initiator)
    fid = TestClient(app)  # dummy; not used
    # we need the real client — caller handles this; this helper isn't used.
    raise NotImplementedError


def _send_and_accept(client: TestClient, a: User, b: User) -> int:
    _auth_as(a)
    fid = client.post("/friendships", json={"username": b.username}).json()["id"]
    _clear_auth()
    _auth_as(b)
    client.post(f"/friendships/{fid}/accept")
    _clear_auth()
    return fid


# ---------------------------------------------------------------------------
# Build on accept
# ---------------------------------------------------------------------------

def test_accept_seeds_entries_for_mutual_albums(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
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

    fid = _send_and_accept(client, alice, bob)

    _auth_as(alice)
    r = client.get(f"/friendships/{fid}/dashboard")
    assert r.status_code == 200
    data = r.json()
    assert data["user_a_username"] == "alice"
    assert data["user_b_username"] == "bob"
    assert len(data["entries"]) == 2

    by_id = {e["album"]["spotify_id"]: e for e in data["entries"]}
    e1 = by_id["spot1"]
    # later of d1 / d3 → d3
    assert e1["mutual_date"].startswith("2025-03-01")
    assert e1["user_a_score"] == 8.0
    assert e1["user_b_score"] == 9.0
    assert e1["mean_score"] == 8.5
    # Identical top 5 → loss 0 → similarity = mean/std
    assert abs(e1["similarity_users"] - (23.4444 / 7.69)) < 1e-4

    e2 = by_id["spot2"]
    assert e2["mutual_date"].startswith("2025-02-01")
    _clear_auth()


def test_dashboard_includes_spotify_similarity(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album("spot1")

    d = datetime(2025, 1, 1, tzinfo=timezone.utc)
    # alice matches Spotify's [1,2,3,4,5] exactly → loss 0 → similarity = mean/std
    _seed_published_rating("alice", a1, 8.0, [1, 2, 3, 4, 5], d)
    # bob disagrees fully → larger loss
    _seed_published_rating("bob", a1, 7.0, [10, 9, 8, 7, 6], d)

    fid = _send_and_accept(client, alice, bob)
    _auth_as(alice)
    entry = client.get(f"/friendships/{fid}/dashboard").json()["entries"][0]
    assert abs(entry["similarity_a_vs_spotify"] - (23.4444 / 7.69)) < 1e-4
    assert entry["similarity_b_vs_spotify"] is not None
    assert entry["similarity_b_vs_spotify"] < entry["similarity_a_vs_spotify"]
    assert entry["spotify_top5_indices"] == [1, 2, 3, 4, 5]
    assert entry["user_a_top_track_indices"] == [1, 2, 3, 4, 5]
    assert entry["user_b_top_track_indices"] == [10, 9, 8, 7, 6]
    _clear_auth()


def test_dashboard_blocked_for_pending(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    r = client.get(f"/friendships/{fid}/dashboard")
    assert r.status_code == 403
    _clear_auth()


def test_dashboard_blocked_for_stranger(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    eve = _seed_user("eve")
    fid = _send_and_accept(client, alice, bob)
    _auth_as(eve)
    r = client.get(f"/friendships/{fid}/dashboard")
    assert r.status_code == 403
    _clear_auth()


# ---------------------------------------------------------------------------
# Publish triggers rebuild
# ---------------------------------------------------------------------------

def test_publishing_third_rating_adds_entry(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album("spot1")
    a2 = _seed_album("spot2")

    d = datetime(2025, 1, 1, tzinfo=timezone.utc)
    _seed_published_rating("alice", a1, 8.0, [1, 2, 3, 4, 5], d)
    _seed_published_rating("bob", a1, 7.0, [1, 2, 3, 4, 5], d)
    _seed_published_rating("alice", a2, 6.0, [1, 2, 3, 4, 5], d)

    fid = _send_and_accept(client, alice, bob)

    _auth_as(alice)
    r = client.get(f"/friendships/{fid}/dashboard")
    assert len(r.json()["entries"]) == 1
    _clear_auth()

    # Bob creates + publishes a draft rating for album 2 via the API.
    _auth_as(bob)
    rid = client.post("/ratings", json={"album_id": a2}).json()["id"]
    client.patch(
        f"/ratings/{rid}",
        json={"score": 7.5, "top_track_indices": [1, 2, 3, 4, 5]},
    )
    pub = client.post(f"/ratings/{rid}/publish")
    assert pub.status_code == 200
    _clear_auth()

    _auth_as(alice)
    r = client.get(f"/friendships/{fid}/dashboard")
    assert len(r.json()["entries"]) == 2
    _clear_auth()


def test_deleting_published_rating_removes_entry(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album("spot1")

    d = datetime(2025, 1, 1, tzinfo=timezone.utc)
    _seed_published_rating("alice", a1, 8.0, [1, 2, 3, 4, 5], d)
    _seed_published_rating("bob", a1, 7.0, [1, 2, 3, 4, 5], d)

    fid = _send_and_accept(client, alice, bob)

    # Find alice's rating id
    db = _db()
    rid = db.query(Rating).filter(Rating.username == "alice").first().id

    _auth_as(alice)
    assert len(client.get(f"/friendships/{fid}/dashboard").json()["entries"]) == 1
    r = client.delete(f"/ratings/{rid}")
    assert r.status_code == 204
    assert client.get(f"/friendships/{fid}/dashboard").json()["entries"] == []
    _clear_auth()


def test_unfriending_clears_entries(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album("spot1")
    d = datetime(2025, 1, 1, tzinfo=timezone.utc)
    _seed_published_rating("alice", a1, 8.0, [1, 2, 3, 4, 5], d)
    _seed_published_rating("bob", a1, 7.0, [1, 2, 3, 4, 5], d)

    fid = _send_and_accept(client, alice, bob)

    db = _db()
    assert db.query(FriendDashboardEntry).count() == 1

    _auth_as(alice)
    r = client.delete(f"/friendships/{fid}")
    assert r.status_code == 204
    _clear_auth()

    db = _db()
    assert db.query(FriendDashboardEntry).count() == 0


def test_dashboard_missing_friendship_404(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.get("/friendships/999/dashboard")
    assert r.status_code == 404
    _clear_auth()
