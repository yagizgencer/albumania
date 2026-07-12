from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.main import app
from app.models.album import Album
from app.models.user import User
from app.db.session import get_db
from app.services.similarity import compute_ranking_loss, compute_similarity_score

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_FAKE_USER = User(id=1, username="tester", email="t@t.com", password_hash="x", display_name="Tester")
_OTHER_USER = User(id=2, username="other", email="o@o.com", password_hash="x", display_name="Other")


def _seed_album(client: TestClient, total_songs: int = 10) -> int:
    """Insert an album directly via DB override and return its id."""
    db = next(app.dependency_overrides[get_db]())
    album = Album(
        spotify_id="spot1",
        title="Test Album",
        artist="Artist",
        release_date="2024-01-01",
        total_songs=total_songs,
    )
    db.add(album)
    db.commit()
    db.refresh(album)
    return album.id


@pytest.fixture()
def authed_client(client: TestClient) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    yield client
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# Similarity math
# ---------------------------------------------------------------------------

def test_ranking_loss_identical_lists() -> None:
    assert compute_ranking_loss([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]) == 0


def test_ranking_loss_canonical_album() -> None:
    # "Even in Arcadia" from reference/albums.json — verified against reference output
    y = [1, 3, 0, 8, 5]
    t = [1, 3, 7, 0, 5]
    assert compute_ranking_loss(y, t) == 6


def test_similarity_score_canonical_album() -> None:
    # k=10 baseline from reference/baseline_loss_stats.json
    mean = 23.4444232
    std = 7.689952822956841
    score = compute_similarity_score(6, mean, std)
    assert score is not None
    assert abs(score - 2.2684694) < 1e-5


def test_similarity_score_zero_std() -> None:
    assert compute_similarity_score(5, 5.0, 0.0) == 0.0


# ---------------------------------------------------------------------------
# Create draft
# ---------------------------------------------------------------------------

def test_create_draft(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    r = authed_client.post("/ratings", json={"album_id": album_id})
    assert r.status_code == 201
    data = r.json()
    assert data["username"] == "tester"
    assert data["album_id"] == album_id
    assert data["status"] == "draft"
    assert data["score"] is None
    assert data["top_track_indices"] is None
    assert data["notes"] == []


def test_create_draft_duplicate_returns_409(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    authed_client.post("/ratings", json={"album_id": album_id})
    r = authed_client.post("/ratings", json={"album_id": album_id})
    assert r.status_code == 409


def test_create_draft_rejects_too_few_tracks(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client, total_songs=4)
    r = authed_client.post("/ratings", json={"album_id": album_id})
    assert r.status_code == 400


def test_create_draft_rejects_too_many_tracks(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client, total_songs=26)
    r = authed_client.post("/ratings", json={"album_id": album_id})
    assert r.status_code == 400


def test_create_draft_allows_boundary_track_counts(authed_client: TestClient) -> None:
    # 5 and 25 are the inclusive bounds and must be allowed.
    for n in (5, 25):
        db = next(app.dependency_overrides[get_db]())
        album = Album(
            spotify_id=f"spot-{n}", title="A", artist="B",
            release_date="2024-01-01", total_songs=n,
        )
        db.add(album)
        db.commit()
        db.refresh(album)
        r = authed_client.post("/ratings", json={"album_id": album.id})
        assert r.status_code == 201


def test_create_draft_requires_auth(client: TestClient) -> None:
    r = client.post("/ratings", json={"album_id": 1})
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Patch (partial save)
# ---------------------------------------------------------------------------

def test_patch_saves_score_and_tracks(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]

    r = authed_client.patch(
        f"/ratings/{rating_id}",
        json={"score": 8.5, "top_track_indices": [3, 1, 7, 2, 9]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["score"] == 8.5
    assert data["top_track_indices"] == [3, 1, 7, 2, 9]
    assert data["status"] == "draft"


def test_patch_saves_notes(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]

    r = authed_client.patch(
        f"/ratings/{rating_id}",
        json={"notes": {"3": "great riff", "1": "favourite"}},
    )
    assert r.status_code == 200
    notes = {n["track_index"]: n["note_text"] for n in r.json()["notes"]}
    assert notes[3] == "great riff"
    assert notes[1] == "favourite"


def test_patch_removes_note_with_empty_string(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(f"/ratings/{rating_id}", json={"notes": {"3": "great riff"}})

    r = authed_client.patch(f"/ratings/{rating_id}", json={"notes": {"3": ""}})
    assert r.status_code == 200
    assert r.json()["notes"] == []


def test_patch_rejects_more_than_5_tracks(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]

    r = authed_client.patch(
        f"/ratings/{rating_id}",
        json={"top_track_indices": [1, 2, 3, 4, 5, 6]},
    )
    assert r.status_code == 422


def test_patch_other_users_rating_returns_403(authed_client: TestClient, client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _OTHER_USER
    r = client.patch(f"/ratings/{rating_id}", json={"score": 5.0})
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------

def _create_publishable_rating(authed_client: TestClient) -> int:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(
        f"/ratings/{rating_id}",
        json={"score": 9.0, "top_track_indices": [1, 2, 3, 4, 5]},
    )
    return rating_id


def test_publish_happy_path(authed_client: TestClient) -> None:
    rating_id = _create_publishable_rating(authed_client)
    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "published"
    assert data["completed_at"] is not None


def test_publish_requires_score(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(f"/ratings/{rating_id}", json={"top_track_indices": [1, 2, 3, 4, 5]})

    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 422
    assert "score" in r.json()["detail"]


def test_publish_requires_exactly_5_tracks(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(f"/ratings/{rating_id}", json={"score": 7.0, "top_track_indices": [1, 2, 3]})

    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 422
    assert "5 top tracks" in r.json()["detail"]


def test_publish_notes_not_required(authed_client: TestClient) -> None:
    """Publishing succeeds without any notes — notes are optional."""
    rating_id = _create_publishable_rating(authed_client)
    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 200


def test_publish_already_published_returns_409(authed_client: TestClient) -> None:
    rating_id = _create_publishable_rating(authed_client)
    authed_client.post(f"/ratings/{rating_id}/publish")
    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 409


def test_edit_published_cannot_drop_below_5_tracks(authed_client: TestClient) -> None:
    rating_id = _create_publishable_rating(authed_client)
    authed_client.post(f"/ratings/{rating_id}/publish")

    r = authed_client.patch(f"/ratings/{rating_id}", json={"top_track_indices": [1, 2]})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Republish (edit an already-published rating)
# ---------------------------------------------------------------------------

def test_republish_bumps_completed_at(authed_client: TestClient) -> None:
    rating_id = _create_publishable_rating(authed_client)
    first = authed_client.post(f"/ratings/{rating_id}/publish").json()

    # Edit the score, then republish — the entry should stay published but move
    # to "now" so it becomes the most recent activity.
    authed_client.patch(f"/ratings/{rating_id}", json={"score": 6.0})
    r = authed_client.post(f"/ratings/{rating_id}/republish")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "published"
    assert data["score"] == 6.0
    assert datetime.fromisoformat(data["completed_at"]) > datetime.fromisoformat(
        first["completed_at"]
    )


def test_republish_requires_published(authed_client: TestClient) -> None:
    # A draft that meets the publish bar still can't be *re*-published.
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(
        f"/ratings/{rating_id}", json={"score": 9.0, "top_track_indices": [1, 2, 3, 4, 5]}
    )
    r = authed_client.post(f"/ratings/{rating_id}/republish")
    assert r.status_code == 422


def test_republish_other_users_rating_returns_403(
    authed_client: TestClient, client: TestClient
) -> None:
    rating_id = _create_publishable_rating(authed_client)
    authed_client.post(f"/ratings/{rating_id}/publish")

    app.dependency_overrides[get_current_user] = lambda: _OTHER_USER
    r = client.post(f"/ratings/{rating_id}/republish")
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def test_delete_draft(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]

    r = authed_client.delete(f"/ratings/{rating_id}")
    assert r.status_code == 204

    r = authed_client.get(f"/ratings/me/{album_id}")
    assert r.status_code == 404


def test_delete_published_rating(authed_client: TestClient) -> None:
    rating_id = _create_publishable_rating(authed_client)
    authed_client.post(f"/ratings/{rating_id}/publish")

    r = authed_client.delete(f"/ratings/{rating_id}")
    assert r.status_code == 204


def test_delete_other_users_rating_returns_403(authed_client: TestClient, client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]

    app.dependency_overrides[get_current_user] = lambda: _OTHER_USER
    r = client.delete(f"/ratings/{rating_id}")
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Publish rejects top-track indices outside the album's real track range
# ---------------------------------------------------------------------------

def test_publish_rejects_out_of_range_top_track(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client, total_songs=10)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(
        f"/ratings/{rating_id}", json={"score": 8.0, "top_track_indices": [1, 2, 3, 4, 999]}
    )
    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 422
    assert "between 1 and 10" in r.json()["detail"]


def test_publish_rejects_zero_index(authed_client: TestClient) -> None:
    # Track numbers are 1-based; 0 is below the valid range.
    album_id = _seed_album(authed_client, total_songs=10)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(
        f"/ratings/{rating_id}", json={"score": 8.0, "top_track_indices": [0, 1, 2, 3, 4]}
    )
    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 422
    assert "between 1 and 10" in r.json()["detail"]


def test_publish_accepts_boundary_top_track_index(authed_client: TestClient) -> None:
    # The last track (index == total_songs) is valid.
    album_id = _seed_album(authed_client, total_songs=10)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(
        f"/ratings/{rating_id}", json={"score": 8.0, "top_track_indices": [6, 7, 8, 9, 10]}
    )
    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 200


def test_publish_boundary_album_5_tracks(authed_client: TestClient) -> None:
    # Minimum rateable album: all 5 tracks are the top 5.
    album_id = _seed_album(authed_client, total_songs=5)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(
        f"/ratings/{rating_id}", json={"score": 8.0, "top_track_indices": [1, 2, 3, 4, 5]}
    )
    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 200


def test_publish_boundary_album_25_tracks(authed_client: TestClient) -> None:
    # Maximum rateable album: indices near the top of the range are valid.
    album_id = _seed_album(authed_client, total_songs=25)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    authed_client.patch(
        f"/ratings/{rating_id}", json={"score": 8.0, "top_track_indices": [21, 22, 23, 24, 25]}
    )
    r = authed_client.post(f"/ratings/{rating_id}/publish")
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Song-note length cap
# ---------------------------------------------------------------------------

def test_patch_rejects_overlong_note(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    r = authed_client.patch(f"/ratings/{rating_id}", json={"notes": {"1": "x" * 2001}})
    assert r.status_code == 422


def test_patch_accepts_note_at_max_length(authed_client: TestClient) -> None:
    album_id = _seed_album(authed_client)
    rating_id = authed_client.post("/ratings", json={"album_id": album_id}).json()["id"]
    r = authed_client.patch(f"/ratings/{rating_id}", json={"notes": {"1": "x" * 2000}})
    assert r.status_code == 200
    notes = {n["track_index"]: n["note_text"] for n in r.json()["notes"]}
    assert len(notes[1]) == 2000
