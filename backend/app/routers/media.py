"""Proxies object-storage reads through the backend. See `R2Storage`'s
docstring in `app/services/storage.py` for why this exists — some ISPs
block R2's own public domain outright, so images are served from our own
already-reachable domain instead."""
import hashlib
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response

from app.services.storage import ObjectNotFoundError, Storage, get_storage

router = APIRouter(tags=["media"])

StorageDep = Annotated[Storage, Depends(get_storage)]

# Avatar keys embed a uuid4 (`avatars/alice-3f2a91c8.png`) and a new upload always
# writes a new key, so a given key's bytes never change. That makes the response
# safely immutable — worth saying out loud, because every avatar in the UI is a
# request to this endpoint, each one a boto3 round-trip to R2 occupying a
# threadpool slot. At max-age=3600 a browser re-fetched the same unchanged image
# every hour; now it fetches once.
_CACHE_CONTROL = "public, max-age=31536000, immutable"


@router.get("/media/{key:path}")
def get_media(
    key: str,
    storage: StorageDep,
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    try:
        data, content_type = storage.get(key)
    except ObjectNotFoundError:
        raise HTTPException(status_code=404, detail="Not found")

    etag = f'"{hashlib.md5(data).hexdigest()}"'
    if if_none_match == etag:
        # Still costs the R2 fetch, but saves re-sending the body to a client
        # whose cache we can't control (and covers keys that aren't immutable).
        return Response(
            status_code=304,
            headers={"Cache-Control": _CACHE_CONTROL, "ETag": etag},
        )

    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": _CACHE_CONTROL, "ETag": etag},
    )
