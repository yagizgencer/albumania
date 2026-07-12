"""Spotify failure modes must degrade to clean HTTP responses, never opaque 500s.

The conftest stub always succeeds, so these tests install a Spotify client whose
methods raise (SpotifyException / RequestException / KeyError) and assert the
central exception handlers translate each to the right status + message.
"""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from requests.exceptions import RequestException
from spotipy.exceptions import SpotifyException

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album
from app.models.rating import Rating, RatingStatus
from app.models.user import User
from app.services.spotify import SpotifyClient, get_spotify_client

_FAKE_USER = User(id=1, username="tester", email="t@t.com", password_hash="x", display_name="Tester")


@pytest.fixture()
def spotify_mock(client: TestClient) -> MagicMock:
    """Authed client whose Spotify client is a mock we can make raise per-test."""
    mock = MagicMock(spec=SpotifyClient)
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    app.dependency_overrides[get_spotify_client] = lambda: mock
    yield mock
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_spotify_client, None)


# ---------------------------------------------------------------------------
# GET /albums/{spotify_id}
# ---------------------------------------------------------------------------

def test_get_album_upstream_404_returns_404(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.get_album.side_effect = SpotifyException(404, -1, "not found")
    r = client.get("/albums/badid")
    assert r.status_code == 404
    assert r.json() == {"detail": "Not found on Spotify"}


def test_get_album_rate_limit_returns_503(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.get_album.side_effect = SpotifyException(429, -1, "rate limited")
    r = client.get("/albums/x")
    assert r.status_code == 503
    assert "busy" in r.json()["detail"]


def test_get_album_upstream_500_returns_502(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.get_album.side_effect = SpotifyException(500, -1, "server error")
    r = client.get("/albums/x")
    assert r.status_code == 502
    assert r.json() == {"detail": "Music service is temporarily unavailable"}


def test_get_album_network_error_returns_502(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.get_album.side_effect = RequestException("boom")
    r = client.get("/albums/x")
    assert r.status_code == 502
    assert r.json() == {"detail": "Music service is temporarily unavailable"}


def test_get_album_malformed_json_returns_502(client: TestClient, spotify_mock: MagicMock) -> None:
    # A partial Spotify payload surfaces as a KeyError while shaping the result.
    spotify_mock.get_album.side_effect = KeyError("id")
    r = client.get("/albums/x")
    assert r.status_code == 502
    assert r.json() == {"detail": "Music service returned unexpected data"}


# ---------------------------------------------------------------------------
# GET /albums/search
# ---------------------------------------------------------------------------

def test_search_albums_rate_limit_returns_503(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.search_albums.side_effect = SpotifyException(429, -1, "rate limited")
    r = client.get("/albums/search?q=test")
    assert r.status_code == 503


def test_search_albums_network_error_returns_502(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.search_albums.side_effect = RequestException("boom")
    r = client.get("/albums/search?q=test")
    assert r.status_code == 502


# ---------------------------------------------------------------------------
# GET /artists/{artist_id} and /artists/search
# ---------------------------------------------------------------------------

def test_get_artist_upstream_404_returns_404(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.get_artist.side_effect = SpotifyException(404, -1, "not found")
    r = client.get("/artists/badid")
    assert r.status_code == 404
    assert r.json() == {"detail": "Not found on Spotify"}


def test_get_artist_rate_limit_returns_503(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.get_artist.side_effect = SpotifyException(429, -1, "rate limited")
    r = client.get("/artists/x")
    assert r.status_code == 503


def test_search_artists_upstream_error_returns_502(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.search_artists.side_effect = SpotifyException(500, -1, "server error")
    r = client.get("/artists/search?q=test")
    assert r.status_code == 502


# ---------------------------------------------------------------------------
# GET /trending/artists — guards the home/dashboard batched-fetch path
# ---------------------------------------------------------------------------

def test_trending_artists_spotify_failure_returns_502(
    client: TestClient, spotify_mock: MagicMock
) -> None:
    # Seed a published rating on an album with an artist_spotify_id so the endpoint
    # reaches the batched get_artists call.
    db = next(app.dependency_overrides[get_db]())
    db.add(User(username="alice", email="a@x.com", password_hash="x", display_name="Alice"))
    album = Album(
        spotify_id="a1", title="A", artist="Artist", artist_spotify_id="art1",
        release_date="2024-01-01", total_songs=10,
    )
    db.add(album)
    db.flush()
    db.add(Rating(username="alice", album_id=album.id, score=8.0, status=RatingStatus.published))
    db.commit()

    spotify_mock.get_artists.side_effect = RequestException("boom")
    r = client.get("/trending/artists")
    assert r.status_code == 502


# ---------------------------------------------------------------------------
# Error bodies must not leak internals
# ---------------------------------------------------------------------------

def test_error_response_has_no_traceback(client: TestClient, spotify_mock: MagicMock) -> None:
    spotify_mock.get_album.side_effect = SpotifyException(500, -1, "server error")
    r = client.get("/albums/x")
    assert r.status_code == 502
    # Only a human-readable detail; no stack trace / exception class / internal keys.
    assert set(r.json().keys()) == {"detail"}
