"""The prod-secret guard and CORS parsing on Settings.

Settings is constructed directly (not via app boot) with `_env_file=None` so a
developer's real .env can't bleed into the assertions. Explicit init kwargs take
priority over environment variables in pydantic-settings, so these are hermetic.
"""
import pytest
from pydantic import ValidationError

from app.core.config import INSECURE_JWT_DEFAULT, Settings


def test_prod_default_jwt_secret_rejected() -> None:
    # cookie_secure=True signals prod; the dev default secret must be refused.
    with pytest.raises(ValidationError):
        Settings(cookie_secure=True, jwt_secret=INSECURE_JWT_DEFAULT, _env_file=None)


def test_prod_real_jwt_secret_accepted() -> None:
    s = Settings(cookie_secure=True, jwt_secret="a-real-generated-secret", _env_file=None)
    assert s.jwt_secret == "a-real-generated-secret"


def test_dev_default_jwt_secret_allowed() -> None:
    # Local dev leaves cookie_secure=False, so the dev default is fine.
    s = Settings(cookie_secure=False, jwt_secret=INSECURE_JWT_DEFAULT, _env_file=None)
    assert s.cookie_secure is False


def test_cors_origin_list_splits_and_strips() -> None:
    s = Settings(cors_origins=" a , b ,", _env_file=None)
    assert s.cors_origin_list == ["a", "b"]
