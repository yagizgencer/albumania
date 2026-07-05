from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.album import Album, BaselineStat
from app.models.invite import ListenInvite, ListenInviteStatus
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
    rid = client.post("/ratings", json={"album_id": album_id}).json()["id"]
    client.patch(
        f"/ratings/{rid}", json={"score": 8.0, "top_track_indices": [1, 2, 3, 4, 5]}
    )
    client.post(f"/ratings/{rid}/publish")
    return rid


# ---------------------------------------------------------------------------
# Create / accept / decline
# ---------------------------------------------------------------------------

def test_create_invite_happy_path(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    r = client.post("/invites", json={"username": "bob", "album_id": a1})
    assert r.status_code == 201
    data = r.json()
    assert data["sender_username"] == "alice"
    assert data["receiver_username"] == "bob"
    assert data["album_id"] == a1
    assert data["status"] == ListenInviteStatus.pending.value
    _clear_auth()


def test_create_invite_rejects_album_out_of_track_range(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album(spotify_id="huge", total_songs=40)
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    r = client.post("/invites", json={"username": "bob", "album_id": a1})
    assert r.status_code == 400
    _clear_auth()


def test_create_invite_rejects_non_friend(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    a1 = _seed_album()
    _auth_as(alice)
    r = client.post("/invites", json={"username": "bob", "album_id": a1})
    assert r.status_code == 403
    _clear_auth()


def test_create_invite_rejects_when_receiver_already_published(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(bob)
    _publish(client, a1)
    _clear_auth()

    _auth_as(alice)
    r = client.post("/invites", json={"username": "bob", "album_id": a1})
    assert r.status_code == 409
    assert "already published" in r.json()["detail"]
    _clear_auth()


def test_create_invite_rejects_duplicate(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    assert client.post("/invites", json={"username": "bob", "album_id": a1}).status_code == 201
    r = client.post("/invites", json={"username": "bob", "album_id": a1})
    assert r.status_code == 409
    # Also blocks reverse direction.
    _clear_auth()
    _auth_as(bob)
    r = client.post("/invites", json={"username": "alice", "album_id": a1})
    assert r.status_code == 409
    _clear_auth()


def test_accept_invite_only_by_receiver(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    # Sender cannot accept their own invite.
    r = client.post(f"/invites/{iid}/accept")
    assert r.status_code == 403
    _clear_auth()

    _auth_as(bob)
    r = client.post(f"/invites/{iid}/accept")
    assert r.status_code == 200
    assert r.json()["status"] == ListenInviteStatus.accepted.value
    _clear_auth()


def test_cancel_deletes_invite(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    assert client.delete(f"/invites/{iid}").status_code == 204
    _clear_auth()

    db = _db()
    assert db.query(ListenInvite).count() == 0


def test_cancel_only_by_sender(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    # Receiver cannot cancel; they must decline.
    assert client.delete(f"/invites/{iid}").status_code == 403
    _clear_auth()


def test_accepted_and_completed_invites_hidden_from_invites_page(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/invites/{iid}/accept")
    # Once accepted, neither side sees it under /invites/me.
    assert client.get("/invites/me").json() == {"incoming": [], "outgoing": []}
    _clear_auth()
    _auth_as(alice)
    assert client.get("/invites/me").json() == {"incoming": [], "outgoing": []}
    _clear_auth()


def test_decline_deletes_invite(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    assert client.post(f"/invites/{iid}/decline").status_code == 204
    _clear_auth()

    db = _db()
    assert db.query(ListenInvite).count() == 0


def test_create_invite_requires_auth(client: TestClient) -> None:
    r = client.post("/invites", json={"username": "bob", "album_id": 1})
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Listen Later view
# ---------------------------------------------------------------------------

def test_solo_draft_appears_with_no_participants(client: TestClient) -> None:
    alice = _seed_user("alice")
    a1 = _seed_album()
    _auth_as(alice)
    client.post("/ratings", json={"album_id": a1})
    r = client.get("/listen-later")
    assert r.status_code == 200
    entries = r.json()
    assert len(entries) == 1
    assert entries[0]["participants"] == []
    assert entries[0]["rating"] is not None
    _clear_auth()


def test_invite_collapses_solo_draft_into_with_friends(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    client.post("/ratings", json={"album_id": a1})
    # Solo entry first.
    entries = client.get("/listen-later").json()
    assert len(entries) == 1 and entries[0]["participants"] == []
    # Send invite — same row should now show bob as a participant.
    client.post("/invites", json={"username": "bob", "album_id": a1})
    entries = client.get("/listen-later").json()
    assert len(entries) == 1
    parts = entries[0]["participants"]
    assert len(parts) == 1
    assert parts[0]["username"] == "bob"
    assert parts[0]["direction"] == "outgoing"
    assert parts[0]["invite_status"] == ListenInviteStatus.pending.value
    assert parts[0]["they_published"] is False
    _clear_auth()


def test_they_published_hidden_for_private_friend(client: TestClient) -> None:
    from app.models.user import ProfileVisibility

    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    # alice keeps a draft (so the album shows in her Listen Later) and invites
    # bob; then bob publishes it (can't be invited after publishing, so order matters).
    _auth_as(alice)
    client.post("/ratings", json={"album_id": a1})
    client.post("/invites", json={"username": "bob", "album_id": a1})
    _clear_auth()
    _auth_as(bob)
    _publish(client, a1)
    _clear_auth()

    # With bob public, alice sees they_published = True.
    _auth_as(alice)
    parts = client.get("/listen-later").json()[0]["participants"]
    assert parts[0]["they_published"] is True
    _clear_auth()

    # bob goes private → the flag must hide that he rated the shared album.
    db = _db()
    db.query(User).filter(User.username == "bob").one().profile_visibility = (
        ProfileVisibility.private
    )
    db.commit()

    _auth_as(alice)
    parts = client.get("/listen-later").json()[0]["participants"]
    assert parts[0]["they_published"] is False
    _clear_auth()


def test_listen_later_supports_multiple_participants(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    carol = _seed_user("carol")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)
    _send_and_accept_friendship(client, alice, carol)

    # Bob invites alice.
    _auth_as(bob)
    iid_b = client.post("/invites", json={"username": "alice", "album_id": a1}).json()["id"]
    _clear_auth()
    # Alice accepts.
    _auth_as(alice)
    client.post(f"/invites/{iid_b}/accept")
    # Alice then invites carol.
    client.post("/invites", json={"username": "carol", "album_id": a1})

    entries = client.get("/listen-later").json()
    assert len(entries) == 1
    parts = {p["username"]: p for p in entries[0]["participants"]}
    assert set(parts) == {"bob", "carol"}
    assert parts["bob"]["direction"] == "incoming"
    assert parts["bob"]["invite_status"] == ListenInviteStatus.accepted.value
    assert parts["carol"]["direction"] == "outgoing"
    _clear_auth()


def test_listen_later_excludes_published_albums(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)
    # Alice rates and publishes.
    _auth_as(alice)
    _publish(client, a1)
    assert client.get("/listen-later").json() == []
    _clear_auth()


def test_pending_outgoing_invite_with_no_draft_does_not_create_row(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)
    _auth_as(alice)
    client.post("/invites", json={"username": "bob", "album_id": a1})
    # No draft, only a pending outgoing invite -> no listen-later row.
    assert client.get("/listen-later").json() == []
    # But it does show up under outgoing invites.
    invites = client.get("/invites/me").json()
    assert len(invites["outgoing"]) == 1
    _clear_auth()


def test_pending_incoming_invite_not_yet_in_listen_later(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)
    _auth_as(alice)
    client.post("/invites", json={"username": "bob", "album_id": a1})
    _clear_auth()
    _auth_as(bob)
    # Bob hasn't accepted — should not see the album in his listen-later yet.
    assert client.get("/listen-later").json() == []
    _clear_auth()


# ---------------------------------------------------------------------------
# Completion / dashboard wiring
# ---------------------------------------------------------------------------

def test_both_publish_marks_invite_completed_and_creates_friend_dashboard_entry(
    client: TestClient,
) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    fid = _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/invites/{iid}/accept")
    _publish(client, a1)
    _clear_auth()
    _auth_as(alice)
    _publish(client, a1)

    # Invite now completed.
    db = _db()
    invite = db.get(ListenInvite, iid)
    assert invite.status == ListenInviteStatus.completed
    # Friend dashboard has the entry.
    r = client.get(f"/friendships/{fid}/dashboard")
    assert len(r.json()["entries"]) == 1
    _clear_auth()


def test_delete_rating_removes_invites(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)
    _auth_as(alice)
    rid = client.post("/ratings", json={"album_id": a1}).json()["id"]
    client.post("/invites", json={"username": "bob", "album_id": a1})
    client.delete(f"/ratings/{rid}")
    _clear_auth()

    db = _db()
    assert db.query(ListenInvite).count() == 0


def test_reinvite_allowed_after_receiver_removes_album(client: TestClient) -> None:
    """The full edge case: alice invites bob, bob accepts and starts a draft, then
    bob removes the album from Listen Later (deletes his draft). That withdraws him
    from the invite, so alice can invite him again — and a re-accept restores the
    shared listen."""
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    # alice invites bob; bob accepts.
    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/invites/{iid}/accept")

    # While the invite is accepted, alice cannot invite again (still exists).
    _clear_auth()
    _auth_as(alice)
    assert client.post("/invites", json={"username": "bob", "album_id": a1}).status_code == 409
    _clear_auth()

    # bob starts a draft, then removes the album from Listen Later.
    _auth_as(bob)
    rid = client.post("/ratings", json={"album_id": a1}).json()["id"]
    client.delete(f"/ratings/{rid}")
    _clear_auth()

    # The invite is gone → alice can invite again, and bob can re-accept.
    db = _db()
    assert db.query(ListenInvite).count() == 0
    _auth_as(alice)
    r = client.post("/invites", json={"username": "bob", "album_id": a1})
    assert r.status_code == 201
    new_iid = r.json()["id"]
    _clear_auth()
    _auth_as(bob)
    assert client.post(f"/invites/{new_iid}/accept").status_code == 200
    _clear_auth()


def test_unfriend_removes_listen_invites(client: TestClient) -> None:
    from app.models.notification import Notification, NotificationType

    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    fid = _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    client.post("/invites", json={"username": "bob", "album_id": a1})
    _clear_auth()

    db = _db()
    assert db.query(ListenInvite).count() == 1
    assert (
        db.query(Notification)
        .filter(Notification.type == NotificationType.listen_invite)
        .count()
        == 1
    )

    # Unfriend → invite and its notification are torn down for both sides.
    _auth_as(bob)
    assert client.delete(f"/friendships/{fid}").status_code == 204
    _clear_auth()

    db = _db()
    assert db.query(ListenInvite).count() == 0
    assert (
        db.query(Notification)
        .filter(Notification.type == NotificationType.listen_invite)
        .count()
        == 0
    )


# ---------------------------------------------------------------------------
# Remove from Listen Later (DELETE /listen-later/{album_id})
# ---------------------------------------------------------------------------

def test_remove_accepted_invite_with_no_draft(client: TestClient) -> None:
    """The reported bug: after accepting an invite (no draft yet), the receiver
    can still remove the album from Listen Later — it withdraws the invite for
    both sides."""
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    a1 = _seed_album()
    _send_and_accept_friendship(client, alice, bob)

    _auth_as(alice)
    iid = client.post("/invites", json={"username": "bob", "album_id": a1}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/invites/{iid}/accept")
    # bob has no draft, but the accepted invite puts the album in his Listen Later.
    assert len(client.get("/listen-later").json()) == 1

    # bob removes it → 204, and it's gone for him.
    assert client.delete(f"/listen-later/{a1}").status_code == 204
    assert client.get("/listen-later").json() == []
    _clear_auth()

    # The invite is gone, so it drops off alice's Listen Later too.
    _auth_as(alice)
    assert client.get("/listen-later").json() == []
    _clear_auth()
    assert _db().query(ListenInvite).count() == 0


def test_remove_draft_only_entry(client: TestClient) -> None:
    alice = _seed_user("alice")
    a1 = _seed_album()
    _auth_as(alice)
    client.post("/ratings", json={"album_id": a1})
    assert len(client.get("/listen-later").json()) == 1

    assert client.delete(f"/listen-later/{a1}").status_code == 204
    assert client.get("/listen-later").json() == []
    _clear_auth()


def test_remove_from_listen_later_404_when_absent(client: TestClient) -> None:
    alice = _seed_user("alice")
    a1 = _seed_album()
    _auth_as(alice)
    assert client.delete(f"/listen-later/{a1}").status_code == 404
    _clear_auth()


def test_remove_from_listen_later_requires_auth(client: TestClient) -> None:
    a1 = _seed_album()
    assert client.delete(f"/listen-later/{a1}").status_code in (401, 403)
