"""Apple Music catalog access with a server-signed developer token."""

import threading
import time
from collections.abc import Callable
from typing import Any

import httpx
import jwt

from kwamz_core.songs import AppleSong

API_BASE = "https://api.music.apple.com"
# Apple allows up to ~6 months; a shorter life limits the damage of a leaked token.
TOKEN_LIFETIME_S = 30 * 24 * 3600
REFRESH_MARGIN_S = 3600
SEARCH_LIMIT = 25  # Apple's maximum per request


class AppleMusicUnavailable(Exception):
    """Apple Music is not configured or did not answer."""


class DeveloperTokenProvider:
    """Signs an ES256 developer token and reuses it until shortly before it expires."""

    def __init__(
        self,
        team_id: str,
        key_id: str,
        private_key: str,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._team_id = team_id
        self._key_id = key_id
        self._private_key = private_key
        self._clock = clock
        self._token: str | None = None
        self._expires_at = 0.0
        self._lock = threading.Lock()

    def get(self) -> str:
        with self._lock:
            now = self._clock()
            if self._token is None or now >= self._expires_at - REFRESH_MARGIN_S:
                self._expires_at = now + TOKEN_LIFETIME_S
                self._token = jwt.encode(
                    {"iss": self._team_id, "iat": int(now), "exp": int(self._expires_at)},
                    self._private_key,
                    algorithm="ES256",
                    headers={"kid": self._key_id},
                )
            return self._token


class AppleMusicClient:
    def __init__(
        self,
        tokens: DeveloperTokenProvider,
        storefront: str,
        http: httpx.Client | None = None,
    ) -> None:
        self._tokens = tokens
        self._storefront = storefront
        self._http = http or httpx.Client(base_url=API_BASE, timeout=10)

    def search_songs(self, term: str, limit: int = SEARCH_LIMIT) -> list[AppleSong]:
        try:
            response = self._http.get(
                f"/v1/catalog/{self._storefront}/search",
                params={"term": term, "types": "songs", "limit": min(limit, SEARCH_LIMIT)},
                headers={"Authorization": f"Bearer {self._tokens.get()}"},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise AppleMusicUnavailable(str(exc)) from exc
        data = response.json().get("results", {}).get("songs", {}).get("data", [])
        return [_to_song(item) for item in data]


def _to_song(item: dict[str, Any]) -> AppleSong:
    attrs = item.get("attributes", {})
    return AppleSong(
        apple_id=item["id"],
        title=attrs.get("name", ""),
        artist=attrs.get("artistName", ""),
        isrc=attrs.get("isrc"),
        duration_ms=attrs.get("durationInMillis"),
        # Apple always appends the umbrella genre "Music".
        genres=[g for g in attrs.get("genreNames", []) if g != "Music"],
    )
