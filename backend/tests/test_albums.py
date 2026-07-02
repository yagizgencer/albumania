from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album, AlbumTrack
from app.models.friendship import Friendship, FriendshipStatus
from app.models.rating import Rating, RatingStatus
from app.models.user import User
from app.services.spotify import SpotifyAlbumResult, SpotifyClient, SpotifyTrack, get_spotify_client

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

_FAKE_USER = User(id=1, username="tester", email="t@t.com", password_hash="x", display_name="Tester")

_FAKE_ALBUM = SpotifyAlbumResult(
    spotify_id="abc123",
    title="Test Album",
    artist="Test Artist",
    artist_spotify_id="artist123",
    release_date="2024-01-01",
    total_songs=10,
    album_art_url="https://example.com/art.jpg",
)

_FAKE_TRACKS = [
    SpotifyTrack(
        index=i,
        name=f"Track {i}",
        spotify_url=f"https://open.spotify.com/track/{i}",
        duration_ms=180_000 + i * 1000,
    )
    for i in range(1, 11)
]


def _make_spotify_mock() -> MagicMock:
    mock = MagicMock(spec=SpotifyClient)
    mock.search_albums.return_value = [_FAKE_ALBUM]
    mock.get_album.return_value = _FAKE_ALBUM
    mock.get_album_tracks.return_value = _FAKE_TRACKS
    return mock


@pytest.fixture()
def authed_client(client: TestClient) -> TestClient:
    """Wrap the conftest client with auth + Spotify mocked."""
    spotify_mock = _make_spotify_mock()
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    app.dependency_overrides[get_spotify_client] = lambda: spotify_mock
    yield client
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_spotify_client, None)


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def test_search_returns_shaped_results(authed_client: TestClient) -> None:
    r = authed_client.get("/albums/search?q=test")
    assert r.status_code == 200
    results = r.json()
    assert len(results) == 1
    album = results[0]
    assert album["spotify_id"] == "abc123"
    assert album["title"] == "Test Album"
    assert album["artist"] == "Test Artist"
    assert album["total_songs"] == 10


def test_search_requires_auth(client: TestClient) -> None:
    r = client.get("/albums/search?q=test")
    assert r.status_code in (401, 403)


def test_search_requires_non_empty_query(authed_client: TestClient) -> None:
    r = authed_client.get("/albums/search?q=")
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# GET /{spotify_id} — auto-import on first call, return cached on second
# ---------------------------------------------------------------------------

def test_get_album_imports_on_first_call(authed_client: TestClient) -> None:
    r = authed_client.get("/albums/abc123")
    assert r.status_code == 200
    data = r.json()
    assert data["spotify_id"] == "abc123"
    assert data["title"] == "Test Album"
    assert len(data["tracks"]) == 10
    assert data["tracks"][0]["index"] == 1
    assert data["tracks"][0]["name"] == "Track 1"


def test_get_album_is_idempotent(authed_client: TestClient) -> None:
    r1 = authed_client.get("/albums/abc123")
    r2 = authed_client.get("/albums/abc123")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]

    # Spotify should only have been called once — second request hits the DB
    mock: MagicMock = app.dependency_overrides[get_spotify_client]()
    assert mock.get_album.call_count == 1


def test_get_album_requires_auth(client: TestClient) -> None:
    r = client.get("/albums/abc123")
    assert r.status_code in (401, 403)


def test_get_album_backfills_missing_tracks(authed_client: TestClient) -> None:
    # An album imported before we paged past 50 tracks: 60 total, only 2 stored.
    db = next(app.dependency_overrides[get_db]())
    album = Album(
        spotify_id="big", title="Big", artist="A", artist_spotify_id="x",
        release_date="2024-01-01", total_songs=60,
    )
    db.add(album)
    db.flush()
    for i in (1, 2):
        db.add(AlbumTrack(album_id=album.id, index=i, name=f"T{i}", spotify_url=None, duration_ms=None))
    db.commit()

    mock: MagicMock = app.dependency_overrides[get_spotify_client]()
    mock.get_album_tracks.return_value = [
        SpotifyTrack(index=i, name=f"T{i}", spotify_url=None, duration_ms=None)
        for i in range(1, 61)
    ]

    r = authed_client.get("/albums/big")
    assert r.status_code == 200
    assert len(r.json()["tracks"]) == 60


# ---------------------------------------------------------------------------
# GET /{spotify_id}/stats — global published mean + rater count
# ---------------------------------------------------------------------------

def _seed_album_with_ratings() -> Album:
    """One album, two published ratings (scores 8 and 6) + one draft (ignored)."""
    db = next(app.dependency_overrides[get_db]())
    for username in ("alice", "bob", "carol"):
        db.add(User(username=username, email=f"{username}@x.com", password_hash="x", display_name=username))
    album = Album(
        spotify_id="abc123",
        title="Test Album",
        artist="Test Artist",
        artist_spotify_id="artist123",
        release_date="2024-01-01",
        total_songs=10,
    )
    db.add(album)
    db.flush()
    db.add(Rating(username="alice", album_id=album.id, score=8.0, status=RatingStatus.published))
    db.add(Rating(username="bob", album_id=album.id, score=6.0, status=RatingStatus.published))
    db.add(Rating(username="carol", album_id=album.id, score=2.0, status=RatingStatus.draft))
    db.commit()
    db.refresh(album)
    return album


def test_album_stats_counts_only_published(authed_client: TestClient) -> None:
    _seed_album_with_ratings()
    r = authed_client.get("/albums/abc123/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["num_raters"] == 2
    assert data["mean_score"] == 7.0  # (8 + 6) / 2, draft of 2.0 excluded


def test_album_stats_empty_when_no_ratings(authed_client: TestClient) -> None:
    r = authed_client.get("/albums/never-imported/stats")
    assert r.status_code == 200
    assert r.json() == {"mean_score": None, "num_raters": 0}


def test_album_stats_requires_auth(client: TestClient) -> None:
    r = client.get("/albums/abc123/stats")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /{spotify_id}/friend-ratings — accepted friends who published this album
# ---------------------------------------------------------------------------

def _seed_album_with_friend_ratings() -> Album:
    """One album where, from `tester`'s perspective:

    - alice & bob are accepted friends with published ratings → included.
    - carol has a published rating but isn't a friend → excluded.
    - dave is a friend but only has a draft → excluded.
    """
    db = next(app.dependency_overrides[get_db]())
    for username in ("tester", "alice", "bob", "carol", "dave"):
        db.add(User(username=username, email=f"{username}@x.com", password_hash="x", display_name=username.capitalize()))
    album = Album(
        spotify_id="abc123",
        title="Test Album",
        artist="Test Artist",
        artist_spotify_id="artist123",
        release_date="2024-01-01",
        total_songs=10,
    )
    db.add(album)
    db.flush()

    for other in ("alice", "bob", "dave"):
        a, b = ("tester", other) if "tester" < other else (other, "tester")
        db.add(Friendship(user_a_username=a, user_b_username=b, status=FriendshipStatus.accepted, requested_by="tester"))

    db.add(Rating(username="alice", album_id=album.id, score=8.0, status=RatingStatus.published))
    db.add(Rating(username="bob", album_id=album.id, score=6.0, status=RatingStatus.published))
    db.add(Rating(username="carol", album_id=album.id, score=9.0, status=RatingStatus.published))
    db.add(Rating(username="dave", album_id=album.id, score=5.0, status=RatingStatus.draft))
    db.commit()
    db.refresh(album)
    return album


def test_friend_ratings_lists_only_published_friends(authed_client: TestClient) -> None:
    _seed_album_with_friend_ratings()
    r = authed_client.get("/albums/abc123/friend-ratings")
    assert r.status_code == 200
    data = r.json()
    # carol (not a friend) and dave (draft only) are excluded.
    assert {d["username"] for d in data} == {"alice", "bob"}
    for entry in data:
        assert isinstance(entry["friendship_id"], int)
        assert entry["profile_picture_url"] is None
        assert entry["display_name"] == entry["username"].capitalize()


def test_friend_ratings_empty_when_album_not_imported(authed_client: TestClient) -> None:
    r = authed_client.get("/albums/never-imported/friend-ratings")
    assert r.status_code == 200
    assert r.json() == []


def test_friend_ratings_requires_auth(client: TestClient) -> None:
    r = client.get("/albums/abc123/friend-ratings")
    assert r.status_code in (401, 403)
