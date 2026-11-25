from collections.abc import Callable

import jwt
from fastapi.testclient import TestClient

from kwamz_api.apple import TOKEN_LIFETIME_S, DeveloperTokenProvider

from .conftest import APPLE_KEY_PEM, AppleStub, User


def test_search_returns_and_stores_songs(
    client: TestClient, user: User, apple_stub: AppleStub
) -> None:
    response = client.get("/search", params={"q": "m83"}, headers=user.headers)
    assert response.status_code == 200, response.text
    songs = response.json()["songs"]

    assert [(s["title"], s["apple_id"]) for s in songs] == [
        ("Midnight City", "1440833098"),
        ("Wait", "1440833099"),
    ]
    assert songs[0]["isrc"] == "FR6V81100380"
    assert songs[0]["duration_ms"] == 243960
    assert songs[0]["genres"] == ["Electronic"]

    request = apple_stub.requests[0]
    assert request.url.path == "/v1/catalog/ca/search"
    assert request.url.params["term"] == "m83"
    assert request.url.params["types"] == "songs"
    assert request.headers["authorization"].startswith("Bearer ")

    # Searching again resolves to the same stored songs.
    again = client.get("/search", params={"q": "m83"}, headers=user.headers).json()["songs"]
    assert [s["id"] for s in again] == [s["id"] for s in songs]


def test_search_result_can_seed_a_radio(client: TestClient, user: User) -> None:
    song = client.get("/search", params={"q": "m83"}, headers=user.headers).json()["songs"][0]
    response = client.post("/radios", headers=user.headers, json={"seed_song_id": song["id"]})
    assert response.status_code == 201


def test_search_requires_query(client: TestClient, user: User) -> None:
    assert client.get("/search", headers=user.headers).status_code == 422
    assert client.get("/search", params={"q": ""}, headers=user.headers).status_code == 422


def test_apple_failure_is_502(client: TestClient, user: User, apple_stub: AppleStub) -> None:
    apple_stub.status_code = 500
    assert client.get("/search", params={"q": "m83"}, headers=user.headers).status_code == 502


def test_apple_not_configured_is_503(make_client: Callable[..., TestClient], user: User) -> None:
    client = make_client()
    client.app.state.apple = None  # type: ignore[attr-defined]
    assert client.get("/search", params={"q": "m83"}, headers=user.headers).status_code == 503


def test_developer_token_is_signed_and_cached() -> None:
    now = 1_800_000_000.0
    provider = DeveloperTokenProvider("TEAMID", "KEYID", APPLE_KEY_PEM, clock=lambda: now)

    token = provider.get()
    header = jwt.get_unverified_header(token)
    claims = jwt.decode(token, options={"verify_signature": False})
    assert header["alg"] == "ES256"
    assert header["kid"] == "KEYID"
    assert claims == {"iss": "TEAMID", "iat": int(now), "exp": int(now) + TOKEN_LIFETIME_S}

    now += TOKEN_LIFETIME_S / 2
    assert provider.get() == token  # reused while valid

    now += TOKEN_LIFETIME_S / 2
    assert provider.get() != token  # re-signed near expiry
