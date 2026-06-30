from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album
from app.models.rating import Rating, RatingStatus
from app.models.user import User
from app.services.spotify import (
    SpotifyAlbumResult,
    SpotifyArtist,
    SpotifyClient,
    get_spotify_client,
)

_FAKE_USER = User(id=1, username="tester", email="t@t.com", password_hash="x", display_name="Tester")

_ARTIST = SpotifyArtist(spotify_id="art1", name="Test Artist", image_url="https://x/art.jpg")


def _album(spotify_id: str, title: str) -> SpotifyAlbumResult:
    return SpotifyAlbumResult(
        spotify_id=spotify_id,
        title=title,
        artist="Test Artist",
        artist_spotify_id="art1",
        release_date="2024-01-01",
        total_songs=10,
        album_art_url=None,
    )


def _make_spotify_mock() -> MagicMock:
    mock = MagicMock(spec=SpotifyClient)
    mock.get_artist.return_value = _ARTIST
    mock.get_artist_albums.return_value = [
        _album("alb_rated", "Rated Album"),
        _album("alb_draft", "Draft Album"),
        _album("alb_none", "Unrated Album"),
    ]
    mock.search_artists.return_value = [_ARTIST]
    return mock


@pytest.fixture()
def authed_client(client: TestClient) -> TestClient:
    spotify_mock = _make_spotify_mock()
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    app.dependency_overrides[get_spotify_client] = lambda: spotify_mock
    yield client
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_spotify_client, None)


def _seed() -> None:
    """Two albums in our DB: one the viewer published, one they have as a draft.
    A second user also published the rated one, so its mean averages two scores."""
    db = next(app.dependency_overrides[get_db]())
    db.add(User(username="tester", email="t@t.com", password_hash="x", display_name="Tester"))
    db.add(User(username="other", email="o@o.com", password_hash="x", display_name="Other"))

    rated = Album(spotify_id="alb_rated", title="Rated Album", artist="Test Artist",
                  artist_spotify_id="art1", release_date="2024-01-01", total_songs=10)
    draft = Album(spotify_id="alb_draft", title="Draft Album", artist="Test Artist",
                  artist_spotify_id="art1", release_date="2024-01-01", total_songs=10)
    db.add_all([rated, draft])
    db.flush()

    db.add(Rating(username="tester", album_id=rated.id, score=9.0, status=RatingStatus.published))
    db.add(Rating(username="other", album_id=rated.id, score=7.0, status=RatingStatus.published))
    db.add(Rating(username="tester", album_id=draft.id, score=None, status=RatingStatus.draft))
    db.commit()


def test_artist_endpoint_shape_and_status(authed_client: TestClient) -> None:
    _seed()
    r = authed_client.get("/artists/art1")
    assert r.status_code == 200
    data = r.json()

    assert data["artist"] == {"spotify_id": "art1", "name": "Test Artist", "image_url": "https://x/art.jpg"}
    by_id = {a["spotify_id"]: a for a in data["albums"]}
    assert len(by_id) == 3

    rated = by_id["alb_rated"]
    assert rated["status"] == "published"
    assert rated["num_raters"] == 2
    assert rated["mean_score"] == 8.0  # (9 + 7) / 2

    draft = by_id["alb_draft"]
    assert draft["status"] == "draft"
    assert draft["num_raters"] == 0
    assert draft["mean_score"] is None

    never = by_id["alb_none"]
    assert never["status"] == "none"
    assert never["num_raters"] == 0
    assert never["mean_score"] is None


def test_artist_endpoint_requires_auth(client: TestClient) -> None:
    r = client.get("/artists/art1")
    assert r.status_code in (401, 403)


def test_artist_search_returns_shaped_results(authed_client: TestClient) -> None:
    r = authed_client.get("/artists/search?q=test")
    assert r.status_code == 200
    results = r.json()
    assert results == [{"spotify_id": "art1", "name": "Test Artist", "image_url": "https://x/art.jpg"}]


def test_artist_search_requires_auth(client: TestClient) -> None:
    r = client.get("/artists/search?q=test")
    assert r.status_code in (401, 403)
