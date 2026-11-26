import time
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import httpx
import jwt
import psycopg
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from kwamz_api.apple import AppleMusicClient, DeveloperTokenProvider
from kwamz_api.auth import TokenVerifier
from kwamz_api.main import create_app
from kwamz_api.settings import Settings
from kwamz_core.radio import RadioResult
from kwamz_core.songs import Song, SongId

ISSUER = "https://test.supabase.co/auth/v1"


def _pem(key: ec.EllipticCurvePrivateKey) -> str:
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


SUPABASE_KEY = ec.generate_private_key(ec.SECP256R1())
APPLE_KEY_PEM = _pem(ec.generate_private_key(ec.SECP256R1()))


def make_token(
    sub: UUID | str, key: ec.EllipticCurvePrivateKey = SUPABASE_KEY, **claims: Any
) -> str:
    payload = {
        "sub": str(sub),
        "aud": "authenticated",
        "iss": ISSUER,
        "role": "authenticated",
        "exp": int(time.time()) + 3600,
        **claims,
    }
    return jwt.encode(payload, key, algorithm="ES256")


@dataclass
class FakeGenerator:
    """Returns catalog songs in a fixed order, skipping excluded ones."""

    pool: list[SongId] = field(default_factory=list)
    version: str = "fake-1"
    override: Callable[[frozenset[SongId]], list[SongId]] | None = None

    def generate(
        self, user_id: UUID, seed: Song, n: int = 20, exclude: frozenset[SongId] = frozenset()
    ) -> RadioResult:
        if self.override is not None:
            tracks = self.override(exclude)
        else:
            tracks = [s for s in self.pool if s not in exclude][:n]
        return RadioResult(tracks=tracks, seed_strategy="direct", model_version=self.version)


APPLE_SEARCH_RESPONSE = {
    "results": {
        "songs": {
            "data": [
                {
                    "id": "1440833098",
                    "type": "songs",
                    "attributes": {
                        "name": "Midnight City",
                        "artistName": "M83",
                        "isrc": "FR6V81100380",
                        "durationInMillis": 243960,
                        "genreNames": ["Electronic", "Music"],
                    },
                },
                {
                    "id": "1440833099",
                    "type": "songs",
                    "attributes": {"name": "Wait", "artistName": "M83"},
                },
            ]
        }
    }
}


@dataclass
class AppleStub:
    requests: list[httpx.Request] = field(default_factory=list)
    status_code: int = 200

    def handler(self, request: httpx.Request) -> httpx.Response:
        """Search returns two M83 songs; every other lookup finds nothing."""
        self.requests.append(request)
        if request.url.path.endswith("/search"):
            return httpx.Response(self.status_code, json=APPLE_SEARCH_RESPONSE)
        if request.url.path.endswith("/charts"):
            return httpx.Response(self.status_code, json={"results": {}})
        return httpx.Response(self.status_code, json={"data": []})


@pytest.fixture
def db(db_url: str) -> Iterator[psycopg.Connection]:
    """Autocommit connection for arranging and inspecting data outside the API."""
    with psycopg.connect(db_url, autocommit=True) as conn:
        yield conn


@pytest.fixture
def catalog(db: psycopg.Connection) -> list[SongId]:
    """50 fresh songs."""
    tag = uuid.uuid4().hex[:6]
    return [
        db.execute(
            "insert into songs (title, artist) values (%s, %s) returning id",
            (f"Song {i} {tag}", f"Artist {tag}"),
        ).fetchone()[0]  # type: ignore[index]
        for i in range(50)
    ]


@pytest.fixture
def generator(catalog: list[SongId]) -> FakeGenerator:
    return FakeGenerator(pool=list(catalog))


@pytest.fixture
def apple_stub() -> AppleStub:
    return AppleStub()


@pytest.fixture
def make_client(
    db_url: str, generator: FakeGenerator, apple_stub: AppleStub
) -> Iterator[Callable[..., TestClient]]:
    clients: list[TestClient] = []

    def make(**overrides: Any) -> TestClient:
        apple = AppleMusicClient(
            DeveloperTokenProvider("TEAMID", "KEYID", APPLE_KEY_PEM),
            storefront="ca",
            http=httpx.Client(
                base_url="https://api.music.apple.com",
                transport=httpx.MockTransport(apple_stub.handler),
            ),
        )
        kwargs: dict[str, Any] = {
            "token_verifier": TokenVerifier(lambda _t: SUPABASE_KEY.public_key(), ISSUER),
            "apple": apple,
            "generator": generator,
        } | overrides
        raise_errors = kwargs.pop("raise_server_exceptions", True)
        settings = Settings(database_url=db_url, **kwargs.pop("settings", {}))
        app = create_app(settings, **kwargs)
        client = TestClient(app, raise_server_exceptions=raise_errors)
        client.__enter__()
        clients.append(client)
        return client

    yield make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


@dataclass
class User:
    id: UUID
    headers: dict[str, str]


@pytest.fixture
def new_user(db: psycopg.Connection) -> Callable[[], User]:
    """A Supabase auth user (as Supabase would have created) with a valid token."""

    def make() -> User:
        user_id = uuid.uuid4()
        db.execute("insert into auth.users (id) values (%s)", (user_id,))
        return User(user_id, {"Authorization": f"Bearer {make_token(user_id)}"})

    return make


@pytest.fixture
def user(new_user: Callable[[], User]) -> User:
    return new_user()
