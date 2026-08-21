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

_OWNER = User(
    id=1,
    username="owner",
    email="o@o.com",
    password_hash="x",
    display_name="Owner",
    profile_visibility=ProfileVisibility.public,
)
_STRANGER = User(
    id=2,
    username="stranger",
    email="s@s.com",
    password_hash="x",
    display_name="Stranger",
)


def _make_spotify_mock() -> MagicMock:
    mock = MagicMock(spec=SpotifyClient)
    # Spotify top 5 = tracks 1..5 by popularity. User picks [1, 3, 5, 7, 9] → some overlap.
    mock.get_top5_popular_indices.return_value = [1, 2, 3, 4, 5]
    return mock


def _seed_user_with_published_rating(
    visibility: ProfileVisibility = ProfileVisibility.public,
    top_track_indices: list[int] | None = None,
    status: RatingStatus = RatingStatus.published,
    spotify_top5: list[int] | None = [1, 2, 3, 4, 5],
) -> tuple[User, Album]:
    db = next(app.dependency_overrides[get_db]())

    owner = User(
        username=_OWNER.username,
        email=_OWNER.email,
        password_hash=_OWNER.password_hash,
        display_name=_OWNER.display_name,
        profile_visibility=visibility,
    )
    db.add(owner)

    album = Album(
        spotify_id="spot1",
        title="Test Album",
        artist="Artist",
        release_date="2024-01-01",
        total_songs=10,
        spotify_top5_indices=spotify_top5,
    )
    db.add(album)
    db.flush()

    db.add(BaselineStat(k=10, mean=23.4444, std=7.69))

    rating = Rating(
        username=owner.username,
        album_id=album.id,
        score=8.5,
        top_track_indices=top_track_indices or [1, 3, 5, 7, 9],
        status=status,
        completed_at=datetime(2025, 6, 1, tzinfo=timezone.utc) if status == RatingStatus.published else None,
    )
    db.add(rating)
    db.commit()
    db.refresh(album)
    return owner, album


@pytest.fixture()
def spotify_mock() -> MagicMock:
    mock = _make_spotify_mock()
    app.dependency_overrides[get_spotify_client] = lambda: mock
    yield mock
    app.dependency_overrides.pop(get_spotify_client, None)


def _auth_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_auth() -> None:
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_dashboard_returns_published_entries(client: TestClient, spotify_mock: MagicMock, spotify_comparison_on) -> None:
    _seed_user_with_published_rating()
    _auth_as(_OWNER)

    r = client.get("/users/owner/dashboard")
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "owner"
    assert len(data["entries"]) == 1

    entry = data["entries"][0]
    assert entry["album"]["title"] == "Test Album"
    assert entry["score"] == 8.5
    assert entry["top_track_indices"] == [1, 3, 5, 7, 9]
    assert entry["spotify_top5_indices"] == [1, 2, 3, 4, 5]
    assert entry["similarity_user_vs_spotify"] is not None

    _clear_auth()


def test_dashboard_similarity_matches_formula(client: TestClient, spotify_mock: MagicMock, spotify_comparison_on) -> None:
    # User picks exactly Spotify's top 5 in same order → loss = 0 → similarity = mean/std
    _seed_user_with_published_rating(top_track_indices=[1, 2, 3, 4, 5])
    _auth_as(_OWNER)

    r = client.get("/users/owner/dashboard")
    assert r.status_code == 200
    sim = r.json()["entries"][0]["similarity_user_vs_spotify"]
    # loss=0, mean=23.4444, std=7.69 → -(0-23.4444)/7.69
    assert abs(sim - (23.4444 / 7.69)) < 1e-4

    _clear_auth()


def test_dashboard_excludes_drafts(client: TestClient, spotify_mock: MagicMock) -> None:
    _seed_user_with_published_rating(status=RatingStatus.draft)
    _auth_as(_OWNER)

    r = client.get("/users/owner/dashboard")
    assert r.status_code == 200
    assert r.json()["entries"] == []

    _clear_auth()


def test_dashboard_never_calls_spotify(client: TestClient, spotify_mock: MagicMock) -> None:
    """The dashboard must be pure SQL, even when top-5 data is missing.

    This is the regression that took the site down: the old code backfilled
    `spotify_top5_indices` inline, and `get_top5_popular_indices` costs one
    request per *track*. A 20-album dashboard meant hundreds of sequential
    Spotify calls in a single request, holding a DB connection throughout, which
    exhausted the pool and broke logins for everyone else.
    """
    _seed_user_with_published_rating(spotify_top5=None)
    _auth_as(_OWNER)

    r = client.get("/users/owner/dashboard")
    assert r.status_code == 200
    spotify_mock.get_top5_popular_indices.assert_not_called()

    # Missing data degrades gracefully rather than erroring.
    entry = r.json()["entries"][0]
    assert entry["spotify_top5_indices"] == []
    assert entry["similarity_user_vs_spotify"] is None

    _clear_auth()


# ---------------------------------------------------------------------------
# Visibility
# ---------------------------------------------------------------------------

def test_dashboard_public_visible_to_other(client: TestClient, spotify_mock: MagicMock) -> None:
    _seed_user_with_published_rating(visibility=ProfileVisibility.public)
    _auth_as(_STRANGER)

    r = client.get("/users/owner/dashboard")
    assert r.status_code == 200

    _clear_auth()


def test_dashboard_friends_only_blocks_stranger(client: TestClient, spotify_mock: MagicMock) -> None:
    _seed_user_with_published_rating(visibility=ProfileVisibility.friends)
    _auth_as(_STRANGER)

    r = client.get("/users/owner/dashboard")
    assert r.status_code == 403

    _clear_auth()


def test_dashboard_friends_only_allows_owner(client: TestClient, spotify_mock: MagicMock) -> None:
    _seed_user_with_published_rating(visibility=ProfileVisibility.friends)
    _auth_as(_OWNER)

    r = client.get("/users/owner/dashboard")
    assert r.status_code == 200

    _clear_auth()


def test_dashboard_unknown_user_returns_404(client: TestClient, spotify_mock: MagicMock) -> None:
    _auth_as(_OWNER)
    r = client.get("/users/ghost/dashboard")
    assert r.status_code == 404
    _clear_auth()


def test_dashboard_requires_auth(client: TestClient) -> None:
    r = client.get("/users/owner/dashboard")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Feature flag: the vs-Spotify comparison ships disabled
# ---------------------------------------------------------------------------

def test_comparison_suppressed_when_feature_disabled(
    client: TestClient, spotify_mock: MagicMock
) -> None:
    """Disabled means hidden everywhere, even where the data still exists.

    Some albums were populated while the credentials were an app that still
    returned track popularity. Without suppressing at the API, the dashboard
    would compare those albums and not others — which reads as a bug rather
    than a switched-off feature.
    """
    _seed_user_with_published_rating(spotify_top5=[1, 2, 3, 4, 5])
    _auth_as(_OWNER)

    entry = client.get("/users/owner/dashboard").json()["entries"][0]
    assert entry["spotify_top5_indices"] == []
    assert entry["similarity_user_vs_spotify"] is None
    # The user's own ratings are untouched — only the comparison is off.
    assert entry["top_track_indices"] == [1, 3, 5, 7, 9]
    assert entry["score"] == 8.5

    _clear_auth()


def test_features_endpoint_reports_the_flag(client: TestClient) -> None:
    """Public, so the logged-out landing page can adapt its copy."""
    r = client.get("/features")
    assert r.status_code == 200
    assert r.json() == {"spotify_comparison": False}


def test_features_endpoint_follows_the_setting(
    client: TestClient, spotify_comparison_on
) -> None:
    assert client.get("/features").json() == {"spotify_comparison": True}
