from fastapi.testclient import TestClient
from jose import jwt


def _user_id_from_token(token: str) -> int:
    return int(jwt.get_unverified_claims(token)["sub"])


def test_register_login_get_user(client: TestClient) -> None:
    # Register
    r = client.post(
        "/auth/register",
        json={"email": "alice@example.com", "password": "secret123", "display_name": "Alice"},
    )
    assert r.status_code == 201
    token = r.json()["access_token"]
    user_id = _user_id_from_token(token)

    # GET /users/{id} with access token
    r = client.get(f"/users/{user_id}", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "alice@example.com"
    assert data["display_name"] == "Alice"
    assert data["profile_visibility"] == "public"

    # Login and confirm the new token also works
    r = client.post(
        "/auth/login",
        json={"email": "alice@example.com", "password": "secret123"},
    )
    assert r.status_code == 200
    token2 = r.json()["access_token"]

    r = client.get(f"/users/{user_id}", headers={"Authorization": f"Bearer {token2}"})
    assert r.status_code == 200


def test_wrong_password_returns_401(client: TestClient) -> None:
    client.post(
        "/auth/register",
        json={"email": "bob@example.com", "password": "correct", "display_name": "Bob"},
    )
    r = client.post(
        "/auth/login",
        json={"email": "bob@example.com", "password": "wrong"},
    )
    assert r.status_code == 401


def test_duplicate_email_returns_409(client: TestClient) -> None:
    payload = {"email": "carol@example.com", "password": "pw", "display_name": "Carol"}
    client.post("/auth/register", json=payload)
    r = client.post("/auth/register", json=payload)
    assert r.status_code == 409


def test_get_user_without_token_returns_401(client: TestClient) -> None:
    r = client.get("/users/1")
    assert r.status_code == 401
