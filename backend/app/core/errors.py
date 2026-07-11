"""Central exception handlers.

Every Spotify call goes through spotipy, which raises `SpotifyException` on an
API error and lets `requests` network errors surface as `RequestException`. Rather
than wrap each of the ~8 router call sites in try/except, we translate those (and a
`KeyError` from a malformed Spotify payload) to clean HTTP responses in one place,
and log once. A catch-all handler turns any other unexpected error into a non-leaky
500 with a server-side traceback.
"""
import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from requests.exceptions import RequestException
from spotipy.exceptions import SpotifyException

logger = logging.getLogger("albumania")

_UPSTREAM_UNAVAILABLE = "Music service is temporarily unavailable"


async def spotify_exception_handler(request: Request, exc: SpotifyException) -> JSONResponse:
    status = exc.http_status
    if status == 404:
        # A bad/nonexistent spotify_id or artist_id passed as a path param.
        logger.info("Spotify 404 for %s: %s", request.url.path, exc)
        return JSONResponse(status_code=404, content={"detail": "Not found on Spotify"})
    if status == 429:
        # Our shared client-credentials token is throttled, not the caller — so 503
        # ("busy, retry") is the honest status rather than passing 429 to the user.
        logger.warning("Spotify rate limited for %s", request.url.path)
        return JSONResponse(
            status_code=503,
            content={"detail": "Music service is busy, please try again shortly"},
        )
    logger.error("Spotify upstream error (%s) for %s: %s", status, request.url.path, exc)
    return JSONResponse(status_code=502, content={"detail": _UPSTREAM_UNAVAILABLE})


async def spotify_network_handler(request: Request, exc: RequestException) -> JSONResponse:
    logger.error("Spotify network error for %s: %s", request.url.path, exc)
    return JSONResponse(status_code=502, content={"detail": _UPSTREAM_UNAVAILABLE})


async def malformed_upstream_handler(request: Request, exc: KeyError) -> JSONResponse:
    # Broad, but every KeyError-prone dict access in this codebase is in the Spotify
    # response shaping (services/spotify.py). The log line carries the request path
    # and the missing key, so a stray non-Spotify KeyError is still easy to spot —
    # and a 502 is strictly better than the bare 500 it replaces.
    logger.error("Malformed upstream response for %s: missing key %s", request.url.path, exc)
    return JSONResponse(
        status_code=502, content={"detail": "Music service returned unexpected data"}
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error for %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
