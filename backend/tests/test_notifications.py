"""Notifications: rows are created on the right events, the per-channel
counts power the three nav badges, and mark-seen only clears the scope it
was asked to."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album, BaselineStat
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.services.notifications import prune_read_notifications
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
    if db.get(BaselineStat, total_songs) is None:
        db.add(BaselineStat(k=total_songs, mean=23.4444, std=7.69))
        db.commit()
    return album.id


def _auth_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_auth() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def _send_and_accept_friendship(client: TestClient, a: User, b: User) -> int:
    _auth_as(a)
    fid = client.post("/friendships", json={"username": b.username}).json()["id"]
    _clear_auth()
    _auth_as(b)
    client.post(f"/friendships/{fid}/accept")
    _clear_auth()
    return fid


def _publish(client: TestClient, album_id: int) -> int:
    # Reuse an existing draft (e.g. one created by accepting an invite); else create.
    created = client.post("/ratings", json={"album_id": album_id})
    if created.status_code == 201:
        rid = created.json()["id"]
    else:
        rid = next(
            r["id"]
            for r in client.get("/ratings/me").json()
            if r["album_id"] == album_id
        )
    client.patch(
        f"/ratings/{rid}", json={"score": 8.0, "top_track_indices": [1, 2, 3, 4, 5]}
    )
    client.post(f"/ratings/{rid}/publish")
    return rid


def test_friend_request_creates_notification(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    _auth_as(alice)
    client.post("/friendships", json={"username": "bob"})
    _clear_auth()

    _auth_as(bob)
    summary = client.get("/notifications/summary").json()
    assert summary["friend_requests"] == 1
    assert summary["bell"] == 1
    rows = client.get("/notifications").json()
    assert len(rows) == 1
    assert rows[0]["type"] == NotificationType.friend_request.value
    assert rows[0]["actor_username"] == "alice"
    _clear_auth()


def test_friend_accept_notifies_requester(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    rows = client.get("/notifications").json()
    types = {r["type"] for r in rows}
    assert NotificationType.friend_accept.value in types
    _clear_auth()


def test_listen_invite_creates_notification(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    client.post("/invites", json={"username": "bob", "album_id": a1})
    _clear_auth()

    _auth_as(bob)
    summary = client.get("/notifications/summary").json()
    assert summary["listen_invites"] == 1
    rows = client.get("/notifications").json()
    types = [r["type"] for r in rows]
    assert NotificationType.listen_invite.value in types
    _clear_auth()


def test_friend_published_notifies_other_party(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/invites/{iid}/accept")
    _clear_auth()

    # Alice publishes first; bob should get a `friend_published` notification.
    _auth_as(alice)
    _publish(client, a1)
    _clear_auth()

    _auth_as(bob)
    rows = client.get("/notifications").json()
    types = [r["type"] for r in rows]
    assert NotificationType.friend_published.value in types
    pub = next(r for r in rows if r["type"] == NotificationType.friend_published.value)
    assert pub["actor_username"] == "alice"
    assert pub["album"]["id"] == a1
    _clear_auth()


def test_accepting_invite_notifies_sender(client: TestClient) -> None:
    """When bob accepts alice's listen invite, alice (the sender) gets a
    `listen_invite_accepted` notification."""
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/invites/{iid}/accept")
    _clear_auth()

    _auth_as(alice)
    rows = client.get("/notifications").json()
    accepted = [
        r for r in rows if r["type"] == NotificationType.listen_invite_accepted.value
    ]
    assert len(accepted) == 1
    assert accepted[0]["actor_username"] == "bob"
    assert accepted[0]["album"]["id"] == a1
    # It counts toward the bell badge.
    assert client.get("/notifications/summary").json()["bell"] >= 1
    _clear_auth()


def test_second_publisher_also_notifies_first(client: TestClient) -> None:
    """Both directions: when the SECOND person publishes (completing the shared
    listen), the FIRST publisher still gets a `friend_published` notification that
    the other has now finished too."""
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/invites/{iid}/accept")
    _clear_auth()

    # Alice publishes first (bob gets notified — covered by the test above).
    _auth_as(alice)
    _publish(client, a1)
    _clear_auth()

    # Bob publishes second → alice should now be told bob finished.
    _auth_as(bob)
    _publish(client, a1)
    _clear_auth()

    _auth_as(alice)
    rows = client.get("/notifications").json()
    pubs = [r for r in rows if r["type"] == NotificationType.friend_published.value]
    assert len(pubs) == 1
    assert pubs[0]["actor_username"] == "bob"
    assert pubs[0]["album"]["id"] == a1
    _clear_auth()


def test_mark_seen_friend_requests_only(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)
    # bob now has a friend_accept notification (from the accept earlier — wait,
    # the accept fires on bob's behalf, so it notifies alice). bob's only
    # notification is none-yet — add a listen invite for bob too.
    _auth_as(alice)
    client.post("/invites", json={"username": "bob", "album_id": a1})
    _clear_auth()

    _auth_as(bob)
    # Add a synthetic friend_request scenario by sending a fresh friendship from
    # a third user.
    _clear_auth()
    carol = _seed_user("carol")
    _auth_as(carol)
    client.post("/friendships", json={"username": "bob"})
    _clear_auth()

    _auth_as(bob)
    summary = client.get("/notifications/summary").json()
    assert summary["friend_requests"] == 1
    assert summary["listen_invites"] == 1
    assert summary["bell"] == 2

    # Mark only friend_requests as seen.
    client.post("/notifications/mark-seen", json={"scope": "friend_requests"})
    summary = client.get("/notifications/summary").json()
    assert summary["friend_requests"] == 0
    assert summary["listen_invites"] == 1
    assert summary["bell"] == 1
    _clear_auth()


def test_mark_seen_bell_clears_all(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)
    _auth_as(alice)
    client.post("/invites", json={"username": "bob", "album_id": a1})
    _clear_auth()

    _auth_as(bob)
    assert client.get("/notifications/summary").json()["bell"] >= 1
    client.post("/notifications/mark-seen", json={"scope": "bell"})
    summary = client.get("/notifications/summary").json()
    assert summary == {"bell": 0, "listen_invites": 0, "friend_requests": 0}
    _clear_auth()


def test_friendship_cancel_cascade_deletes_notification(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    # alice cancels her own pending request (DELETE friendship).
    client.delete(f"/friendships/{fid}")
    _clear_auth()

    db = _db()
    # The friend_request notification for bob should be gone via FK cascade.
    leftover = db.scalars(
        select_count_for(Notification).where(Notification.recipient_username == "bob")
    ).all()
    assert leftover == [] or all(n.type != NotificationType.friend_request for n in leftover)


def test_declining_friend_request_keeps_notification(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    _clear_auth()

    # bob declines the request.
    _auth_as(bob)
    assert client.post(f"/friendships/{fid}/decline").status_code == 204
    rows = client.get("/notifications").json()
    _clear_auth()

    # The friend_request notification survives (detached + marked read).
    fr = [r for r in rows if r["type"] == NotificationType.friend_request.value]
    assert len(fr) == 1
    assert fr[0]["read"] is True

    db = _db()
    n = db.scalar(
        select(Notification).where(
            Notification.recipient_username == "bob",
            Notification.type == NotificationType.friend_request,
        )
    )
    assert n is not None and n.friendship_id is None


def test_declining_listen_invite_keeps_notification(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()

    _auth_as(bob)
    assert client.post(f"/invites/{iid}/decline").status_code == 204
    rows = client.get("/notifications").json()
    _clear_auth()

    inv = [r for r in rows if r["type"] == NotificationType.listen_invite.value]
    assert len(inv) == 1
    assert inv[0]["read"] is True

    db = _db()
    n = db.scalar(
        select(Notification).where(
            Notification.recipient_username == "bob",
            Notification.type == NotificationType.listen_invite,
        )
    )
    assert n is not None and n.invite_id is None


def select_count_for(model):
    """tiny helper so the assert above reads cleanly."""
    from sqlalchemy import select

    return select(model)


def _add_notif(recipient: str, read: bool, when: datetime) -> int:
    """Insert a bare notification directly (actor/friendship FKs are nullable)."""
    db = _db()
    n = Notification(
        recipient_username=recipient,
        type=NotificationType.friend_accept,
        read=read,
        created_at=when,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n.id


def test_prune_keeps_last_ten_read_and_all_unread(client: TestClient) -> None:
    _seed_user("bob")
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    read_ids = [_add_notif("bob", read=True, when=base + timedelta(minutes=i)) for i in range(15)]
    _ = [_add_notif("bob", read=False, when=base + timedelta(minutes=100 + i)) for i in range(3)]

    db = _db()
    deleted = prune_read_notifications(db, "bob")
    db.commit()
    assert deleted == 5  # 15 read → drop the 5 oldest

    rows = db.scalars(
        select(Notification).where(Notification.recipient_username == "bob")
    ).all()
    read_rows = [n for n in rows if n.read]
    unread_rows = [n for n in rows if not n.read]
    assert len(unread_rows) == 3  # unread never touched
    # Exactly the 10 newest read rows survive.
    assert sorted(n.id for n in read_rows) == read_ids[5:]

    # Idempotent: a second prune with nothing stale deletes nothing.
    assert prune_read_notifications(db, "bob") == 0


def test_mark_seen_prunes_old_read(client: TestClient) -> None:
    bob = _seed_user("bob")
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    for i in range(15):
        _add_notif("bob", read=False, when=base + timedelta(minutes=i))

    _auth_as(bob)
    # Opening the bell marks all 15 read; retention then trims to the newest 10.
    client.post("/notifications/mark-seen", json={"scope": "bell"})
    rows = client.get("/notifications", params={"limit": 100}).json()
    assert len(rows) == 10
    _clear_auth()


def test_notification_requires_auth(client: TestClient) -> None:
    assert client.get("/notifications/summary").status_code in (401, 403)
    assert client.get("/notifications").status_code in (401, 403)
    assert client.post("/notifications/mark-seen", json={"scope": "bell"}).status_code in (
        401,
        403,
    )
