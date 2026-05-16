from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import auth, users, albums, ratings, friendships, invites

settings = get_settings()

app = FastAPI(title="Albumania API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(albums.router)
app.include_router(ratings.router)
app.include_router(friendships.router)
app.include_router(invites.router)
app.include_router(invites.listen_later_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
