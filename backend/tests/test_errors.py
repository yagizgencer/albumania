"""The catch-all Exception handler must not swallow FastAPI's own handling.

Registering a handler for `Exception` could, if done wrong, intercept validation
errors and HTTPExceptions and turn them all into 500s. These lock in that
422 (request validation) and 404 (raised HTTPException) still behave normally.
"""
import pytest
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.main import app
from app.models.user import User

_FAKE_USER = User(id=1, username="tester", email="t@t.com", password_hash="x", display_name="Tester")


@pytest.fixture()
def authed_client(client: TestClient) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    yield client
    app.dependency_overrides.pop(get_current_user, None)


def test_validation_error_still_422(authed_client: TestClient) -> None:
    # album_id must be an int; a bad body is a request-validation error, not a 500.
    r = authed_client.post("/ratings", json={"album_id": "not-an-int"})
    assert r.status_code == 422


def test_http_exception_still_passthrough(authed_client: TestClient) -> None:
    # A deliberately-raised 404 keeps its status and detail.
    r = authed_client.get("/ratings/me/999999")
    assert r.status_code == 404
    assert r.json()["detail"] == "Rating not found"
