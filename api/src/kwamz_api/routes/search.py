from typing import Annotated

from fastapi import HTTPException, Query, Request, status

from kwamz_api.apple import AppleMusicClient, AppleMusicUnavailable
from kwamz_api.auth import UserId
from kwamz_api.db import Conn
from kwamz_api.routes import make_router
from kwamz_api.schemas import SearchResults
from kwamz_core.songs import upsert_apple_songs

router = make_router("search")


@router.get("/search")
def search(
    request: Request,
    conn: Conn,
    _user: UserId,
    q: Annotated[str, Query(min_length=1, max_length=200)],
) -> SearchResults:
    """Search the Apple Music catalog. Every result is stored in `songs` so it can seed a
    radio."""
    apple: AppleMusicClient | None = request.app.state.apple
    if apple is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Apple Music is not configured")
    try:
        found = apple.search_songs(q)
    except AppleMusicUnavailable as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Apple Music search failed") from exc
    return SearchResults(songs=upsert_apple_songs(conn, found))
