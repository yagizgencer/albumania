from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.main import app
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
