from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.user import ProfileVisibility, User


def _seed_user(username: str, visibility: ProfileVisibility = ProfileVisibility.public) -> User:
    db = next(app.dependency_overrides[get_db]())
    user = User(
        username=username,
        email=f"{username}@x.com",
        password_hash="x",
        display_name=username.title(),
        profile_visibility=visibility,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_auth() -> None:
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def test_send_friend_request_happy_path(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    _auth_as(alice)

    r = client.post("/friendships", json={"username": "bob"})
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "pending"
    assert data["requested_by"] == "alice"
    assert data["user_a_username"] == "alice"
    assert data["user_b_username"] == "bob"
    _clear_auth()


def test_cannot_friend_self(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.post("/friendships", json={"username": "alice"})
    assert r.status_code == 400
    _clear_auth()


def test_cannot_friend_unknown_user(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.post("/friendships", json={"username": "ghost"})
    assert r.status_code == 404
    _clear_auth()


def test_cannot_duplicate_friendship(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    _auth_as(alice)
    client.post("/friendships", json={"username": "bob"})
    r = client.post("/friendships", json={"username": "bob"})
    assert r.status_code == 409
    _clear_auth()


def test_cannot_duplicate_from_other_side(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    _auth_as(alice)
    client.post("/friendships", json={"username": "bob"})
    _clear_auth()
    _auth_as(bob)
    r = client.post("/friendships", json={"username": "alice"})
    assert r.status_code == 409
    _clear_auth()


# ---------------------------------------------------------------------------
# Accept / decline / delete
# ---------------------------------------------------------------------------

def test_accept_moves_to_accepted(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    _clear_auth()

    _auth_as(bob)
    r = client.post(f"/friendships/{fid}/accept")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "accepted"
    assert data["accepted_at"] is not None
    _clear_auth()


def test_cannot_accept_own_request(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    r = client.post(f"/friendships/{fid}/accept")
    assert r.status_code == 400
    _clear_auth()


def test_decline_removes_pending(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    _clear_auth()

    _auth_as(bob)
    r = client.post(f"/friendships/{fid}/decline")
    assert r.status_code == 204
    # Re-requesting should succeed (the row is gone)
    r2 = client.post("/friendships", json={"username": "alice"})
    assert r2.status_code == 201
    _clear_auth()


def test_unfriend_deletes_accepted(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/friendships/{fid}/accept")
    r = client.delete(f"/friendships/{fid}")
    assert r.status_code == 204
    _clear_auth()


def test_stranger_cannot_touch_friendship(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bob")
    eve = _seed_user("eve")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    _clear_auth()

    _auth_as(eve)
    assert client.post(f"/friendships/{fid}/accept").status_code == 403
    assert client.delete(f"/friendships/{fid}").status_code == 403
    _clear_auth()


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

def test_list_my_friendships_buckets(client: TestClient) -> None:
    alice = _seed_user("alice")
    bob = _seed_user("bob")
    carol = _seed_user("carol")
    dave = _seed_user("dave")

    # alice → bob (outgoing)
    _auth_as(alice)
    client.post("/friendships", json={"username": "bob"})
    _clear_auth()

    # carol → alice (incoming for alice)
    _auth_as(carol)
    client.post("/friendships", json={"username": "alice"})
    _clear_auth()

    # alice → dave, dave accepts
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "dave"}).json()["id"]
    _clear_auth()
    _auth_as(dave)
    client.post(f"/friendships/{fid}/accept")
    _clear_auth()

    _auth_as(alice)
    r = client.get("/friendships/me")
    assert r.status_code == 200
    data = r.json()
    assert len(data["outgoing"]) == 1 and data["outgoing"][0]["user_b_username"] == "bob"
    assert len(data["incoming"]) == 1 and data["incoming"][0]["requested_by"] == "carol"
    assert len(data["accepted"]) == 1
    _clear_auth()


# ---------------------------------------------------------------------------
# User search
# ---------------------------------------------------------------------------

def test_user_search_matches_username_and_display(client: TestClient) -> None:
    alice = _seed_user("alice")
    _seed_user("bobross")
    _seed_user("carol")
    _auth_as(alice)

    r = client.get("/users/search", params={"q": "bob"})
    assert r.status_code == 200
    assert [u["username"] for u in r.json()] == ["bobross"]
    _clear_auth()


def test_user_search_excludes_self(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.get("/users/search", params={"q": "ali"})
    assert r.status_code == 200
    assert r.json() == []
    _clear_auth()


# ---------------------------------------------------------------------------
# Visibility integration with dashboard
# ---------------------------------------------------------------------------

def test_private_profile_visible_to_friend(client: TestClient) -> None:
    alice = _seed_user("alice", visibility=ProfileVisibility.private)
    bob = _seed_user("bob")
    _auth_as(alice)
    fid = client.post("/friendships", json={"username": "bob"}).json()["id"]
    _clear_auth()
    _auth_as(bob)
    client.post(f"/friendships/{fid}/accept")
    # bob is now a friend → dashboard should be visible (returns 200 with empty entries)
    r = client.get("/users/alice/dashboard")
    assert r.status_code == 200
    _clear_auth()


def test_private_profile_blocks_pending_friend(client: TestClient) -> None:
    alice = _seed_user("alice", visibility=ProfileVisibility.private)
    bob = _seed_user("bob")
    _auth_as(alice)
    client.post("/friendships", json={"username": "bob"})
    _clear_auth()
    # bob has not accepted yet
    _auth_as(bob)
    r = client.get("/users/alice/dashboard")
    assert r.status_code == 403
    _clear_auth()
