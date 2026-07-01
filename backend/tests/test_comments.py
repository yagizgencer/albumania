import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album
from app.models.friendship import Friendship, FriendshipStatus
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services.friendship import ordered_pair

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _db():
    return next(app.dependency_overrides[get_db]())


def _seed_user(username: str) -> User:
    db = _db()
    db.add(User(username=username, email=f"{username}@x.com", password_hash="x", display_name=username.title()))
    db.commit()
    return User(id=None, username=username, email=f"{username}@x.com", password_hash="x", display_name=username.title())


def _seed_album(spotify_id: str = "spot1", total_songs: int = 10) -> str:
    db = _db()
    db.add(
        Album(
            spotify_id=spotify_id, title="Test Album", artist="Artist",
            release_date="2024-01-01", total_songs=total_songs,
        )
    )
    db.commit()
    return spotify_id


def _make_friends(a: str, b: str) -> None:
    db = _db()
    ua, ub = ordered_pair(a, b)
    db.add(Friendship(user_a_username=ua, user_b_username=ub, status=FriendshipStatus.accepted, requested_by=a))
    db.commit()


def _auth_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _post_comment(client: TestClient, spotify_id: str, text: str, visibility: str = "public") -> dict:
    r = client.post(f"/albums/{spotify_id}/comments", json={"text": text, "visibility": visibility})
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def test_create_and_list_comment(client: TestClient) -> None:
    alice = _seed_user("alice")
    sid = _seed_album()
    _auth_as(alice)

    created = _post_comment(client, sid, "great album 🎵")
    assert created["is_mine"] is True
    assert created["author"]["username"] == "alice"
    assert created["edited_at"] is None

    r = client.get(f"/albums/{sid}/comments")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["text"] == "great album 🎵"


def test_create_requires_auth(client: TestClient) -> None:
    sid = _seed_album()
    r = client.post(f"/albums/{sid}/comments", json={"text": "hi", "visibility": "public"})
    assert r.status_code in (401, 403)


def test_list_empty_for_unimported_album(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.get("/albums/nope/comments")
    assert r.status_code == 200
    assert r.json() == []


def test_edit_sets_edited_flag(client: TestClient) -> None:
    alice = _seed_user("alice")
    sid = _seed_album()
    _auth_as(alice)
    c = _post_comment(client, sid, "first")

    r = client.patch(f"/comments/{c['id']}", json={"text": "second"})
    assert r.status_code == 200
    data = r.json()
    assert data["text"] == "second"
    assert data["edited_at"] is not None


def test_edit_forbidden_for_non_owner(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    sid = _seed_album()
    _auth_as(alice)
    c = _post_comment(client, sid, "mine")

    _auth_as(bob)
    r = client.patch(f"/comments/{c['id']}", json={"text": "hacked"})
    assert r.status_code == 403


def test_delete_owner_only(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    sid = _seed_album()
    _auth_as(alice)
    c = _post_comment(client, sid, "mine")

    _auth_as(bob)
    assert client.delete(f"/comments/{c['id']}").status_code == 403

    _auth_as(alice)
    assert client.delete(f"/comments/{c['id']}").status_code == 204
    assert client.get(f"/albums/{sid}/comments").json() == []


# ---------------------------------------------------------------------------
# Anonymity (identity masking)
# ---------------------------------------------------------------------------

def _author_of_only_comment(client: TestClient, sid: str):
    data = client.get(f"/albums/{sid}/comments").json()
    assert len(data) == 1
    return data[0]["author"]


def test_public_shows_author_to_stranger(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    sid = _seed_album()
    _auth_as(alice)
    _post_comment(client, sid, "hi", "public")

    _auth_as(bob)
    author = _author_of_only_comment(client, sid)
    assert author is not None and author["username"] == "alice"


def test_friends_visibility_masks_non_friends(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    carol = _seed_user("carol")
    _make_friends("alice", "carol")
    sid = _seed_album()
    _auth_as(alice)
    _post_comment(client, sid, "hi", "friends")

    _auth_as(bob)  # not a friend → masked
    assert _author_of_only_comment(client, sid) is None

    _auth_as(carol)  # friend → shown
    assert _author_of_only_comment(client, sid)["username"] == "alice"

    _auth_as(alice)  # self → shown
    assert _author_of_only_comment(client, sid)["username"] == "alice"


def test_private_visibility_masks_everyone_but_author(client: TestClient) -> None:
    alice = _seed_user("alice")
    carol = _seed_user("carol")
    _make_friends("alice", "carol")
    sid = _seed_album()
    _auth_as(alice)
    _post_comment(client, sid, "secret", "private")

    _auth_as(carol)  # even a friend is masked for private
    assert _author_of_only_comment(client, sid) is None

    _auth_as(alice)
    assert _author_of_only_comment(client, sid)["username"] == "alice"


# ---------------------------------------------------------------------------
# Reactions + net score
# ---------------------------------------------------------------------------

def test_reactions_separate_counts_and_toggle(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    carol = _seed_user("carol")
    sid = _seed_album()
    _auth_as(alice)
    c = _post_comment(client, sid, "hi")

    _auth_as(bob)
    r = client.put(f"/comments/{c['id']}/reaction", json={"value": "up"})
    assert r.json() == {"likes": 1, "dislikes": 0, "viewer_reaction": "up"}

    _auth_as(carol)
    r = client.put(f"/comments/{c['id']}/reaction", json={"value": "down"})
    assert r.json() == {"likes": 1, "dislikes": 1, "viewer_reaction": "down"}

    # Bob clears his up → only carol's dislike remains.
    _auth_as(bob)
    r = client.put(f"/comments/{c['id']}/reaction", json={"value": "none"})
    assert r.json() == {"likes": 0, "dislikes": 1, "viewer_reaction": None}


def test_like_notifies_author_anonymously(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    sid = _seed_album()
    _auth_as(alice)
    c = _post_comment(client, sid, "hi")

    _auth_as(bob)
    client.put(f"/comments/{c['id']}/reaction", json={"value": "up"})

    db = _db()
    notes = db.query(Notification).filter(
        Notification.recipient_username == "alice",
        Notification.type == NotificationType.comment_liked,
    ).all()
    assert len(notes) == 1
    assert notes[0].actor_username is None  # anonymous
    assert notes[0].comment_id == c["id"]
    assert notes[0].album_id is not None


def test_self_like_does_not_notify(client: TestClient) -> None:
    alice = _seed_user("alice")
    sid = _seed_album()
    _auth_as(alice)
    c = _post_comment(client, sid, "hi")
    client.put(f"/comments/{c['id']}/reaction", json={"value": "up"})

    db = _db()
    assert db.query(Notification).filter(
        Notification.type == NotificationType.comment_liked
    ).count() == 0


def test_repeat_likes_are_deduped(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    carol = _seed_user("carol")
    sid = _seed_album()
    _auth_as(alice)
    c = _post_comment(client, sid, "hi")

    _auth_as(bob)
    client.put(f"/comments/{c['id']}/reaction", json={"value": "up"})
    _auth_as(carol)
    client.put(f"/comments/{c['id']}/reaction", json={"value": "up"})

    db = _db()
    assert db.query(Notification).filter(
        Notification.recipient_username == "alice",
        Notification.type == NotificationType.comment_liked,
    ).count() == 1  # collapsed while unread
