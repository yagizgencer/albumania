from fastapi.testclient import TestClient
from jose import jwt


def _username_from_token(token: str) -> str:
    return jwt.get_unverified_claims(token)["sub"]


def test_register_login_get_user(client: TestClient) -> None:
    # Register
    r = client.post(
        "/auth/register",
        json={"username": "alice", "email": "alice@example.com", "password": "secret123", "display_name": "Alice"},
    )
    assert r.status_code == 201
    token = r.json()["access_token"]
    username = _username_from_token(token)
    assert username == "alice"

    # GET /users/{username} with access token
    r = client.get(f"/users/{username}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["username"] == "alice"
    assert data["email"] == "alice@example.com"
    assert data["display_name"] == "Alice"
    assert data["profile_visibility"] == "public"

    # Login and confirm the new token also works
    r = client.post(
        "/auth/login",
        json={"identifier": "alice@example.com", "password": "secret123"},
    )
    assert r.status_code == 200
    token2 = r.json()["access_token"]

    r = client.get(f"/users/{username}", headers={"Authorization": f"Bearer {token2}"})
    assert r.status_code == 200


def test_wrong_password_returns_401(client: TestClient) -> None:
    client.post(
        "/auth/register",
        json={"username": "bob", "email": "bob@example.com", "password": "correct", "display_name": "Bob"},
    )
    r = client.post(
        "/auth/login",
        json={"identifier": "bob@example.com", "password": "wrong"},
    )
    assert r.status_code == 401


def test_duplicate_email_returns_409(client: TestClient) -> None:
    payload = {"username": "carol", "email": "carol@example.com", "password": "pw", "display_name": "Carol"}
    client.post("/auth/register", json=payload)
    r = client.post("/auth/register", json={**payload, "username": "carol2"})
    assert r.status_code == 409


def test_duplicate_username_returns_409(client: TestClient) -> None:
    payload = {"username": "dave", "email": "dave@example.com", "password": "pw", "display_name": "Dave"}
    client.post("/auth/register", json=payload)
    r = client.post("/auth/register", json={**payload, "email": "dave2@example.com"})
    assert r.status_code == 409


def test_get_user_without_token_returns_401(client: TestClient) -> None:
    r = client.get("/users/alice")
    assert r.status_code == 401


def _register(client: TestClient, username: str = "alice") -> str:
    r = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "secret123",
            "display_name": username.title(),
        },
    )
    assert r.status_code == 201
    return r.json()["access_token"]


def test_login_with_username(client: TestClient) -> None:
    _register(client, "alice")
    r = client.post("/auth/login", json={"identifier": "alice", "password": "secret123"})
    assert r.status_code == 200
    assert _username_from_token(r.json()["access_token"]) == "alice"


def test_logout_expires_refresh_cookie(client: TestClient) -> None:
    _register(client, "alice")
    r = client.post("/auth/logout")
    assert r.status_code == 204
    set_cookie = r.headers.get("set-cookie", "")
    assert "refresh_token=" in set_cookie
    assert "Max-Age=0" in set_cookie or "expires=" in set_cookie.lower()


def test_new_user_is_unverified(client: TestClient) -> None:
    token = _register(client, "alice")
    r = client.get("/users/alice", headers={"Authorization": f"Bearer {token}"})
    assert r.json()["email_verified"] is False


def test_verify_email_flow(client: TestClient) -> None:
    from app.core.security import create_email_token

    token = _register(client, "alice")
    verify = client.post("/auth/verify-email", json={"token": create_email_token("alice")})
    assert verify.status_code == 204
    r = client.get("/users/alice", headers={"Authorization": f"Bearer {token}"})
    assert r.json()["email_verified"] is True


def test_verify_email_rejects_bad_token(client: TestClient) -> None:
    _register(client, "alice")
    r = client.post("/auth/verify-email", json={"token": "not-a-token"})
    assert r.status_code == 400


def test_resend_verification_noop_when_verified(client: TestClient) -> None:
    from app.core.security import create_email_token

    token = _register(client, "alice")
    client.post("/auth/verify-email", json={"token": create_email_token("alice")})
    r = client.post("/auth/resend-verification", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204


def test_unverified_user_blocked_from_friend_request(client: TestClient) -> None:
    token = _register(client, "alice")
    _register(client, "bob")
    r = client.post(
        "/friendships",
        json={"username": "bob"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


def test_verified_user_can_send_friend_request(client: TestClient) -> None:
    from app.core.security import create_email_token

    token = _register(client, "alice")
    _register(client, "bob")
    client.post("/auth/verify-email", json={"token": create_email_token("alice")})
    r = client.post(
        "/friendships",
        json={"username": "bob"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201


def test_change_password_happy_path(client: TestClient) -> None:
    token = _register(client, "alice")
    r = client.post(
        "/auth/change-password",
        json={"current_password": "secret123", "new_password": "newsecret123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 204
    # Old password no longer works; new one does.
    assert client.post("/auth/login", json={"identifier": "alice", "password": "secret123"}).status_code == 401
    assert client.post("/auth/login", json={"identifier": "alice", "password": "newsecret123"}).status_code == 200


def test_change_password_wrong_current(client: TestClient) -> None:
    token = _register(client, "alice")
    r = client.post(
        "/auth/change-password",
        json={"current_password": "wrong", "new_password": "newsecret123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400


def test_change_password_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/auth/change-password",
        json={"current_password": "x", "new_password": "newsecret123"},
    )
    assert r.status_code in (401, 403)
