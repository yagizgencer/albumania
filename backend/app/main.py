import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from requests.exceptions import RequestException
from spotipy.exceptions import SpotifyException

from app.core.config import get_settings
from app.core.errors import (
    malformed_upstream_handler,
    spotify_exception_handler,
    spotify_network_handler,
    unhandled_exception_handler,
)
from app.routers import (
    albums,
    artists,
    auth,
    comments,
    friendships,
    home,
    invites,
    notifications,
    ratings,
    users,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

settings = get_settings()

app = FastAPI(title="Albumania API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Translate upstream (Spotify) failures and any unexpected error into clean HTTP
# responses. Starlette dispatches the most specific handler, so HTTPException and
# RequestValidationError keep their built-in handling (404/403/422 unchanged).
app.add_exception_handler(SpotifyException, spotify_exception_handler)
app.add_exception_handler(RequestException, spotify_network_handler)
app.add_exception_handler(KeyError, malformed_upstream_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Serve uploaded avatars when STORAGE_BACKEND=local. In production (r2) the
# bucket serves the files directly and this mount is skipped.
if settings.storage_backend.lower() == "local":
    static_root = Path(settings.static_dir)
    static_root.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(static_root)), name="static")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(albums.router)
app.include_router(artists.router)
app.include_router(comments.router)
app.include_router(home.router)
app.include_router(ratings.router)
app.include_router(friendships.router)
app.include_router(invites.router)
app.include_router(invites.listen_later_router)
app.include_router(notifications.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
