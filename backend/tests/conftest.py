import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app
from app.services.spotify import SpotifyClient, get_spotify_client
from app.services.storage import InMemoryStorage, get_storage


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
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
