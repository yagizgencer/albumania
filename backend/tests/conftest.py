import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app
from app.services.similarity import reset_baseline_cache
from app.services.spotify import SpotifyClient, get_spotify_client
from app.services.spotify import _breaker as spotify_breaker
from app.services.spotify import _cache as spotify_cache
from app.services.spotify import _spacer as spotify_spacer
import app.services.spotify as spotify_module
from app.services.storage import InMemoryStorage, get_storage


@pytest.fixture(autouse=True)
def _clear_process_caches():
    """Reset the process-wide caches between tests.

    In production these live for the lifetime of the uvicorn process, which is
    the point. In tests every case builds a fresh in-memory DB, so a cached
    `baseline_stats` table or Spotify response from one test would leak into the
    next.
    """
    reset_baseline_cache()
    spotify_cache.clear()
    spotify_breaker.reset()
    # Real spacing would cost a wall-clock second per simulated call.
    spotify_spacer.interval = 0
    spotify_spacer.reset()
    spotify_module._popularity_unavailable = False
    yield
    reset_baseline_cache()
    spotify_cache.clear()


class _StubSpotifyClient(SpotifyClient):
    def __init__(self) -> None:
        pass  # skip real credentials

    def search_albums(self, query, limit=10):
        return []

    def get_album(self, spotify_id):
        return None

    def get_album_tracks(self, spotify_id):
        return []

    def get_top5_popular_indices(self, spotify_id):
        return []

    def get_artist(self, artist_id):
        return None

    def get_artists(self, artist_ids):
        return {}

    def get_artist_albums(self, artist_id):
        return []

    def search_artists(self, query, limit=10):
        return []


@pytest.fixture(autouse=True)
def _stub_spotify():
    stub = _StubSpotifyClient()
    app.dependency_overrides[get_spotify_client] = lambda: stub
    yield
    app.dependency_overrides.pop(get_spotify_client, None)


@pytest.fixture(autouse=True)
def _stub_email(monkeypatch):
    # Never send real email in tests. The register / resend / change-password
    # endpoints call send_email, which hits the Resend API whenever a real
    # RESEND_API_KEY is present in .env — running the suite would burn the
    # account's daily quota. Patch it to a no-op (mirrors the Spotify stub).
    # send_verification_email / send_password_changed_email call send_email by
    # name within app.services.email, so patching it there intercepts all of them.
    monkeypatch.setattr(
        "app.services.email.send_email",
        lambda to, subject, html: None,
    )


@pytest.fixture()
def storage():
    s = InMemoryStorage()
    app.dependency_overrides[get_storage] = lambda: s
    yield s
    app.dependency_overrides.pop(get_storage, None)


@pytest.fixture()
def client(storage):
    # StaticPool forces all connections to reuse the same in-memory DB connection,
    # so create_all and the session see the same tables.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Some code legitimately needs a session outside a request — the Spotify
    # rate-limit breaker persists its cooldown so a restart can't resume calling
    # mid-penalty, and it has no request to borrow one from. That code reaches
    # for the module-level SessionLocal, which the dependency override does NOT
    # intercept: without this patch it would connect to whatever DATABASE_URL
    # points at, i.e. the real database.
    import app.db.session as db_session

    real_session_local = db_session.SessionLocal
    db_session.SessionLocal = TestSession
    with TestClient(app) as c:
        yield c
    db_session.SessionLocal = real_session_local
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def spotify_comparison_on(monkeypatch):
    """Turn the vs-Spotify comparison on for tests that exercise it.

    It ships disabled: Spotify's Feb 2026 changes removed track `popularity`, so
    there is nothing to rank by. The feature is a switch rather than deleted
    code, and these tests are what keep it working for the day it can be
    switched back on.
    """
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "spotify_comparison_enabled", True)
