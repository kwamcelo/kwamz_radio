import time
import uuid
from collections.abc import Callable

import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from .conftest import User, make_token

PROTECTED = [
    ("get", "/me"),
    ("patch", "/me"),
    ("get", "/search?q=m83"),
    ("get", "/radios"),
    ("post", "/radios"),
    ("get", f"/radios/{uuid.uuid4()}"),
    ("post", "/events"),
    ("put", f"/likes/{uuid.uuid4()}"),
    ("delete", f"/bans/{uuid.uuid4()}"),
]


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_endpoints_reject_missing_token(client: TestClient, method: str, path: str) -> None:
    response = client.request(method, path)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "token",
    [
        pytest.param("not-a-jwt", id="garbage"),
        pytest.param(make_token(uuid.uuid4(), exp=int(time.time()) - 10), id="expired"),
        pytest.param(make_token(uuid.uuid4(), aud="anon"), id="wrong-audience"),
        pytest.param(
            make_token(uuid.uuid4(), iss="https://evil.example/auth/v1"), id="wrong-issuer"
        ),
        pytest.param(
            make_token(uuid.uuid4(), key=ec.generate_private_key(ec.SECP256R1())), id="wrong-key"
        ),
        pytest.param(make_token("not-a-uuid"), id="bad-sub"),
    ],
)
def test_invalid_tokens_are_rejected(client: TestClient, token: str) -> None:
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_health_needs_no_token(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_first_request_creates_profile(
    client: TestClient, user: User, db: psycopg.Connection
) -> None:
    response = client.get("/me", headers=user.headers)
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user.id)
    assert body["provider_preference"] == "auto"
    assert db.execute("select count(*) from users where id = %s", (user.id,)).fetchone() == (1,)

    # Idempotent on later requests.
    assert client.get("/me", headers=user.headers).status_code == 200


def test_update_provider_preference(client: TestClient, user: User) -> None:
    response = client.patch("/me", headers=user.headers, json={"provider_preference": "youtube"})
    assert response.status_code == 200
    assert response.json()["provider_preference"] == "youtube"
    assert client.get("/me", headers=user.headers).json()["provider_preference"] == "youtube"

    bad = client.patch("/me", headers=user.headers, json={"provider_preference": "spotify"})
    assert bad.status_code == 422


def test_app_starts_without_supabase_config(
    make_client: Callable[..., TestClient], user: User
) -> None:
    client = make_client(token_verifier=None, settings={"supabase_url": ""})
    assert client.get("/health").status_code == 200
    assert client.get("/me", headers=user.headers).status_code == 401
