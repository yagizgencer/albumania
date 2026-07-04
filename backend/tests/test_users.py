from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.user import ProfileVisibility, User


def _seed_user(username: str) -> User:
    db = next(app.dependency_overrides[get_db]())
    user = User(
        username=username,
        email=f"{username}@x.com",
        password_hash="x",
        display_name=username.title(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _clear_auth() -> None:
    app.dependency_overrides.pop(get_current_user, None)


def test_get_user_returns_description_field(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.get("/users/alice")
    assert r.status_code == 200
    data = r.json()
    assert data["description"] is None
    _clear_auth()


def test_patch_me_updates_fields(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.patch(
        "/users/me",
        json={
            "display_name": "Alice Cooper",
            "description": "Loves Rock",
            "profile_visibility": "private",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["display_name"] == "Alice Cooper"
    assert data["description"] == "Loves Rock"
    assert data["profile_visibility"] == "private"
    _clear_auth()


def test_patch_me_partial_only_updates_provided(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    client.patch("/users/me", json={"description": "Hello"})
    r = client.get("/users/alice")
    data = r.json()
    assert data["description"] == "Hello"
    assert data["display_name"] == "Alice"  # untouched
    assert data["profile_visibility"] == ProfileVisibility.public.value
    _clear_auth()


def test_patch_me_requires_auth(client: TestClient) -> None:
    r = client.patch("/users/me", json={"display_name": "X"})
    assert r.status_code in (401, 403)


def test_patch_me_rejects_blank_display_name(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    r = client.patch("/users/me", json={"display_name": ""})
    assert r.status_code == 422
    _clear_auth()


def test_patch_me_description_length_limit(client: TestClient) -> None:
    alice = _seed_user("alice")
    _auth_as(alice)
    # 1000 chars is the cap and is accepted.
    r = client.patch("/users/me", json={"description": "x" * 1000})
    assert r.status_code == 200
    assert r.json()["description"] == "x" * 1000
    # 1001 chars is rejected.
    r = client.patch("/users/me", json={"description": "x" * 1001})
    assert r.status_code == 422
    _clear_auth()
