"""Supabase JWT verification."""

from collections.abc import Callable
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from kwamz_api.db import Conn

# Given a raw token, return the public key that should have signed it.
type KeyResolver = Callable[[str], Any]

ALGORITHMS = ["ES256", "RS256"]
AUDIENCE = "authenticated"


class TokenVerifier:
    def __init__(self, resolve_key: KeyResolver, issuer: str) -> None:
        self._resolve_key = resolve_key
        self._issuer = issuer

    @classmethod
    def from_jwks(cls, jwks_url: str, issuer: str) -> "TokenVerifier":
        client = jwt.PyJWKClient(jwks_url, cache_keys=True)
        return cls(lambda token: client.get_signing_key_from_jwt(token).key, issuer)

    @classmethod
    def unconfigured(cls) -> "TokenVerifier":
        """Without SUPABASE_URL the API still starts (tests, OpenAPI export) but rejects
        every token."""

        def no_key(_token: str) -> Any:
            raise jwt.PyJWKClientError("SUPABASE_URL is not set")

        return cls(no_key, issuer="")

    def verify(self, token: str) -> UUID:
        """Return the user id (`sub`) of a valid token, or raise jwt.PyJWTError."""
        claims = jwt.decode(
            token,
            self._resolve_key(token),
            algorithms=ALGORITHMS,
            audience=AUDIENCE,
            issuer=self._issuer,
            options={"require": ["exp", "sub"]},
        )
        return UUID(claims["sub"])


_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"}
    )


def current_user_id(
    request: Request,
    conn: Conn,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UUID:
    if credentials is None:
        raise _unauthorized("Missing bearer token")
    verifier: TokenVerifier = request.app.state.token_verifier
    try:
        user_id = verifier.verify(credentials.credentials)
    except (jwt.PyJWTError, ValueError) as exc:
        raise _unauthorized("Invalid token") from exc

    # First request from a new Supabase user creates their profile row.
    conn.execute("insert into users (id) values (%s) on conflict (id) do nothing", (user_id,))
    return user_id


UserId = Annotated[UUID, Depends(current_user_id)]
