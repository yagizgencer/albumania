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
        json={"username": "bobby", "email": "bob@example.com", "password": "correct1", "display_name": "Bob"},
    )
    r = client.post(
        "/auth/login",
        json={"identifier": "bob@example.com", "password": "wrongpass"},
    )
    assert r.status_code == 401


def test_duplicate_email_returns_409(client: TestClient) -> None:
    payload = {"username": "carol", "email": "carol@example.com", "password": "secret123", "display_name": "Carol"}
    client.post("/auth/register", json=payload)
    r = client.post("/auth/register", json={**payload, "username": "carol2"})
    assert r.status_code == 409


def test_duplicate_username_returns_409(client: TestClient) -> None:
    payload = {"username": "david", "email": "dave@example.com", "password": "secret123", "display_name": "Dave"}
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
    _register(client, "bobby")
    r = client.post(
        "/friendships",
        json={"username": "bobby"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


def test_verified_user_can_send_friend_request(client: TestClient) -> None:
    from app.core.security import create_email_token

    token = _register(client, "alice")
    _register(client, "bobby")
    client.post("/auth/verify-email", json={"token": create_email_token("alice")})
    r = client.post(
        "/friendships",
        json={"username": "bobby"},
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


# ---------------------------------------------------------------------------
# Signup validation (username + email + password)
# ---------------------------------------------------------------------------

def _reg_payload(**overrides) -> dict:
    base = {
        "username": "validuser",
        "email": "valid@example.com",
        "password": "secret123",
        "display_name": "Valid",
    }
    return {**base, **overrides}


def test_register_rejects_short_username(client: TestClient) -> None:
    r = client.post("/auth/register", json=_reg_payload(username="abc"))
    assert r.status_code == 422


def test_register_rejects_long_username(client: TestClient) -> None:
    r = client.post("/auth/register", json=_reg_payload(username="a" * 21))
    assert r.status_code == 422


def test_register_rejects_username_with_symbols(client: TestClient) -> None:
    for bad in ("has space", "bad!name", "at@sign", "amp&name"):
        r = client.post("/auth/register", json=_reg_payload(username=bad, email=f"{abs(hash(bad))}@x.com"))
        assert r.status_code == 422, bad


def test_register_allows_dots_and_underscores(client: TestClient) -> None:
    r = client.post("/auth/register", json=_reg_payload(username="a.b_c1"))
    assert r.status_code == 201


def test_register_rejects_bad_email(client: TestClient) -> None:
    for bad in ("notanemail", "no@domain", "no domain@x.com", "@nolocal.com"):
        r = client.post("/auth/register", json=_reg_payload(username="validuser", email=bad))
        assert r.status_code == 422, bad


# ---------------------------------------------------------------------------
# Forgot / reset password
# ---------------------------------------------------------------------------

def test_forgot_password_returns_neutral_for_unknown_email(client: TestClient) -> None:
    # No account with this email — still 202 with the neutral message (no leak).
    r = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.status_code == 202
    assert "reset link" in r.json()["detail"].lower()


def test_forgot_password_returns_neutral_for_known_email(client: TestClient) -> None:
    _register(client, "alice")
    r = client.post("/auth/forgot-password", json={"email": "alice@example.com"})
    assert r.status_code == 202


def test_reset_password_flow(client: TestClient) -> None:
    from app.core.security import create_password_reset_token

    _register(client, "alice")
    token = create_password_reset_token("alice")
    r = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "brandnew123"},
    )
    assert r.status_code == 204
    # Old password no longer works; the new one does.
    assert client.post("/auth/login", json={"identifier": "alice", "password": "secret123"}).status_code == 401
    assert client.post("/auth/login", json={"identifier": "alice", "password": "brandnew123"}).status_code == 200


def test_reset_password_rejects_bad_token(client: TestClient) -> None:
    _register(client, "alice")
    r = client.post("/auth/reset-password", json={"token": "garbage", "new_password": "brandnew123"})
    assert r.status_code == 400


def test_reset_password_rejects_wrong_token_type(client: TestClient) -> None:
    # An email-verify token must not be usable to reset a password.
    from app.core.security import create_email_token

    _register(client, "alice")
    r = client.post(
        "/auth/reset-password",
        json={"token": create_email_token("alice"), "new_password": "brandnew123"},
    )
    assert r.status_code == 400
