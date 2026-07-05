from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album
from app.models.comment import Comment, CommentVisibility
from app.models.friendship import Friendship, FriendshipStatus
from app.models.rating import Rating, RatingStatus
from app.models.user import User
from app.services.friendship import ordered_pair
from app.services.spotify import SpotifyClient, get_spotify_client

BASE = datetime(2025, 1, 1, tzinfo=timezone.utc)


def _at(minutes: int) -> datetime:
    return BASE + timedelta(minutes=minutes)


def _db():
    return next(app.dependency_overrides[get_db]())


def _seed_user(username: str) -> User:
    db = _db()
    db.add(User(username=username, email=f"{username}@x.com", password_hash="x", display_name=username.title()))
    db.commit()
    return User(username=username, email=f"{username}@x.com", password_hash="x", display_name=username.title())


def _seed_album(spotify_id: str, artist_sid: str | None = None) -> int:
    db = _db()
    a = Album(
        spotify_id=spotify_id,
        title=f"Album {spotify_id}",
        artist=f"Artist {artist_sid or spotify_id}",
        artist_spotify_id=artist_sid or f"art-{spotify_id}",
        release_date="2024-01-01",
        total_songs=10,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a.id


def _rate(username: str, album_id: int, score: float, when: datetime) -> None:
    db = _db()
    db.add(Rating(username=username, album_id=album_id, score=score, status=RatingStatus.published, completed_at=when))
    db.commit()


def _comment(username: str, album_id: int, text: str, when: datetime, vis=CommentVisibility.public) -> None:
    db = _db()
    db.add(Comment(username=username, album_id=album_id, text=text, visibility=vis, created_at=when))
    db.commit()


def _friend(a: str, b: str, when: datetime) -> None:
    db = _db()
    ua, ub = ordered_pair(a, b)
    db.add(Friendship(user_a_username=ua, user_b_username=ub, status=FriendshipStatus.accepted, requested_by=a, accepted_at=when))
    db.commit()


def _auth_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


# ---------------------------------------------------------------------------
# Feed
# ---------------------------------------------------------------------------

def test_feed_merges_orders_and_respects_visibility(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    _seed_user("carol")
    a1 = _seed_album("a1")

    _friend("alice", "bob", _at(1))
    _rate("alice", a1, 8.0, _at(2))
    _rate("bob", a1, 6.0, _at(3))
    _rate("carol", a1, 5.0, _at(4))  # stranger → excluded
    _comment("alice", a1, "my thoughts", _at(5))
    _comment("bob", a1, "bob public", _at(6))
    _comment("bob", a1, "bob secret", _at(7), CommentVisibility.private)  # excluded
    _comment("carol", a1, "carol", _at(8))  # excluded

    _auth_as(alice)
    r = client.get("/home/feed")
    assert r.status_code == 200
    items = r.json()["items"]

    types = [it["type"] for it in items]
    # Newest first: bob public comment(6), alice comment(5), bob rating(3),
    # alice rating(2), new friend(1).
    assert types == [
        "friend_commented",
        "you_commented",
        "friend_rated",
        "you_rated",
        "new_friend",
    ]
    # Stranger + private are gone.
    actors = {it["actor"]["username"] for it in items}
    assert "carol" not in actors
    assert all("secret" not in (it.get("excerpt") or "") for it in items)

    # Payload details.
    friend_comment = items[0]
    assert friend_comment["excerpt"] == "bob public"
    assert friend_comment["album"]["spotify_id"] == "a1"
    you_rated = next(it for it in items if it["type"] == "you_rated")
    assert you_rated["score"] == 8.0


def test_feed_shows_friend_rating_but_hides_private_comment(
    client: TestClient,
) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    a1 = _seed_album("a1")

    _friend("alice", "bob", _at(1))
    _rate("bob", a1, 6.0, _at(3))  # friend's rating → shown
    _comment("bob", a1, "bob public", _at(4))  # public comment → shown
    _comment("bob", a1, "bob secret", _at(5), CommentVisibility.private)  # hidden

    _auth_as(alice)
    items = client.get("/home/feed").json()["items"]
    by_type = {it["type"] for it in items}

    # A friend's rating, public comment, and the new-friend event all appear.
    assert "friend_rated" in by_type
    assert "friend_commented" in by_type
    assert "new_friend" in by_type
    excerpts = [it.get("excerpt") for it in items]
    assert "bob public" in excerpts
    # ...but a private *comment* stays hidden (comment visibility is separate).
    assert "bob secret" not in excerpts


def test_feed_paginates_with_before_cursor(client: TestClient) -> None:
    alice = _seed_user("alice")
    a1 = _seed_album("a1")
    for i in range(5):
        _rate("alice", _seed_album(f"alb{i}"), 7.0, _at(10 + i))
    _ = a1

    _auth_as(alice)
    first = client.get("/home/feed", params={"limit": 2}).json()
    assert len(first["items"]) == 2
    assert first["next_before"] is not None

    second = client.get("/home/feed", params={"limit": 2, "before": first["next_before"]}).json()
    assert len(second["items"]) == 2
    # No overlap between pages.
    assert {i["id"] for i in first["items"]}.isdisjoint({i["id"] for i in second["items"]})


def test_feed_filters_by_type(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    a1 = _seed_album("a1")

    _friend("alice", "bob", _at(1))
    _rate("alice", a1, 8.0, _at(2))
    _comment("alice", a1, "thoughts", _at(3))

    _auth_as(alice)

    # No filter → every category present.
    all_types = {it["type"] for it in client.get("/home/feed").json()["items"]}
    assert all_types == {"you_rated", "you_commented", "new_friend"}

    # A single category narrows to just its events.
    ratings = client.get("/home/feed", params={"types": ["ratings"]}).json()["items"]
    assert {it["type"] for it in ratings} == {"you_rated"}

    # Multiple categories union; the omitted one (friends) is excluded.
    two = client.get("/home/feed", params={"types": ["ratings", "comments"]}).json()["items"]
    assert {it["type"] for it in two} == {"you_rated", "you_commented"}


def test_feed_requires_auth(client: TestClient) -> None:
    r = client.get("/home/feed")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Trending albums
# ---------------------------------------------------------------------------

def test_trending_albums_rank_count_and_mean(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    a1 = _seed_album("a1")
    a2 = _seed_album("a2")
    _rate("alice", a1, 8.0, _at(1))
    _rate("bob", a1, 6.0, _at(2))  # a1: 2 ratings, mean 7.0
    _rate("alice", a2, 9.0, _at(3))  # a2: 1 rating

    _auth_as(alice)
    data = client.get("/trending/albums", params={"period": "all"}).json()
    assert [d["spotify_id"] for d in data] == ["a1", "a2"]
    assert data[0]["rank"] == 1
    assert data[0]["rating_count"] == 2
    assert data[0]["mean_score"] == 7.0
    assert data[1]["rating_count"] == 1


def test_trending_albums_period_window(client: TestClient) -> None:
    alice = _seed_user("alice")
    recent = _seed_album("recent")
    old = _seed_album("old")
    now = datetime.now(timezone.utc)
    _rate("alice", recent, 8.0, now - timedelta(days=1))
    _rate("alice", old, 8.0, now - timedelta(days=400))

    _auth_as(alice)
    ids = [d["spotify_id"] for d in client.get("/trending/albums", params={"period": "week"}).json()]
    assert "recent" in ids
    assert "old" not in ids


# ---------------------------------------------------------------------------
# Trending artists
# ---------------------------------------------------------------------------

def test_trending_artists_grouped_with_images(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    a1 = _seed_album("a1", artist_sid="artX")
    a2 = _seed_album("a2", artist_sid="artX")  # same artist
    a3 = _seed_album("a3", artist_sid="artY")
    _rate("alice", a1, 8.0, _at(1))
    _rate("bob", a2, 7.0, _at(2))  # artX: 2 ratings across its albums
    _rate("alice", a3, 9.0, _at(3))  # artY: 1

    spotify_mock = MagicMock(spec=SpotifyClient)
    spotify_mock.get_artists.return_value = {"artX": "https://img/x.jpg", "artY": None}
    app.dependency_overrides[get_spotify_client] = lambda: spotify_mock

    _auth_as(alice)
    data = client.get("/trending/artists", params={"period": "all"}).json()
    assert data[0]["artist_spotify_id"] == "artX"
    assert data[0]["rank"] == 1
    assert data[0]["rating_count"] == 2
    assert data[0]["image_url"] == "https://img/x.jpg"
    assert data[1]["artist_spotify_id"] == "artY"
    spotify_mock.get_artists.assert_called_once()

    app.dependency_overrides.pop(get_spotify_client, None)


def test_trending_requires_auth(client: TestClient) -> None:
    assert client.get("/trending/albums").status_code in (401, 403)
    assert client.get("/trending/artists").status_code in (401, 403)
