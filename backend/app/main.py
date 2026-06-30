from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.routers import (
    albums,
    artists,
    auth,
    friendships,
    invites,
    notifications,
    ratings,
    users,
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
app.include_router(ratings.router)
app.include_router(friendships.router)
app.include_router(invites.router)
app.include_router(invites.listen_later_router)
app.include_router(notifications.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
