"""Proxies object-storage reads through the backend. See `R2Storage`'s
docstring in `app/services/storage.py` for why this exists — some ISPs
block R2's own public domain outright, so images are served from our own
already-reachable domain instead."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response

from app.services.storage import ObjectNotFoundError, Storage, get_storage

router = APIRouter(tags=["media"])

StorageDep = Annotated[Storage, Depends(get_storage)]


@router.get("/media/{key:path}")
def get_media(key: str, storage: StorageDep) -> Response:
    try:
        data, content_type = storage.get(key)
    except ObjectNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )
