import uuid
from collections.abc import Callable

import psycopg
from fastapi.testclient import TestClient

from kwamz_core.songs import SongId

from .conftest import User


def event(song: SongId, **fields: object) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "song_id": str(song),
        "type": "play_start",
        "provider": "apple",
        "client_ts": "2026-11-25T12:00:00Z",
        **fields,
    }


def test_batch_insert(
    client: TestClient, user: User, catalog: list[SongId], db: psycopg.Connection
) -> None:
    radio = client.post(
        "/radios", headers=user.headers, json={"seed_song_id": str(catalog[0])}
    ).json()
    song = catalog[1]
    batch = [
        event(song, radio_id=radio["id"], radio_position=0),
        event(song, type="progress", position_ms=10_000, radio_id=radio["id"], radio_position=0),
        event(song, type="skip", position_ms=12_000, payload={"reason": "button"}),
        {"song_id": str(song), "type": "like", "client_ts": "2026-11-25T12:00:13Z"},  # no id
    ]

    response = client.post("/events", headers=user.headers, json=batch)
    assert response.status_code == 200, response.text
    assert response.json() == {"received": 4, "inserted": 4}

    rows = db.execute(
        "select type::text, user_id, radio_id, position_ms, payload from events"
        " where user_id = %s order by client_ts, position_ms nulls first",
        (user.id,),
    ).fetchall()
    assert [r[0] for r in rows] == ["play_start", "progress", "skip", "like"]
    assert {r[1] for r in rows} == {user.id}
    assert rows[2][4] == {"reason": "button"}


def test_resending_a_batch_is_idempotent(
    client: TestClient, user: User, catalog: list[SongId]
) -> None:
    batch = [event(catalog[0]), event(catalog[1])]
    assert client.post("/events", headers=user.headers, json=batch).json()["inserted"] == 2

    batch.append(event(catalog[2]))
    assert client.post("/events", headers=user.headers, json=batch).json() == {
        "received": 3,
        "inserted": 1,
    }


def test_rejects_other_users_radio(
    client: TestClient, new_user: Callable[[], User], catalog: list[SongId], db: psycopg.Connection
) -> None:
    alice, bob = new_user(), new_user()
    radio = client.post(
        "/radios", headers=alice.headers, json={"seed_song_id": str(catalog[0])}
    ).json()

    response = client.post(
        "/events", headers=bob.headers, json=[event(catalog[1], radio_id=radio["id"])]
    )
    assert response.status_code == 422
    count = db.execute("select count(*) from events where user_id = %s", (bob.id,)).fetchone()
    assert count == (0,)


def test_rejects_unknown_song_and_stores_nothing(
    client: TestClient, user: User, catalog: list[SongId], db: psycopg.Connection
) -> None:
    batch = [event(catalog[0]), event(uuid.uuid4())]
    assert client.post("/events", headers=user.headers, json=batch).status_code == 422
    count = db.execute("select count(*) from events where user_id = %s", (user.id,)).fetchone()
    assert count == (0,)


def test_validates_batch(client: TestClient, user: User, catalog: list[SongId]) -> None:
    def post(body: object) -> int:
        return client.post("/events", headers=user.headers, json=body).status_code

    assert post([]) == 422
    assert post([event(catalog[0]) for _ in range(501)]) == 422
    assert post([event(catalog[0], type="dance")]) == 422
    assert post([event(catalog[0], radio_position=20)]) == 422
    assert post([event(catalog[0], provider="spotify")]) == 422


def test_every_app_event_type_is_stored_with_its_context(
    client: TestClient, user: User, catalog: list[SongId], db: psycopg.Connection
) -> None:
    radio = client.post(
        "/radios", headers=user.headers, json={"seed_song_id": str(catalog[0])}
    ).json()
    song = radio["tracks"][3]["song"]["id"]
    types = [
        "play_start", "progress", "pause", "seek", "skip", "complete",
        "like", "unlike", "add_to_library", "ban", "start_radio_from", "unavailable",
    ]  # fmt: skip
    batch = [
        event(song, type=t, radio_id=radio["id"], radio_position=3, position_ms=1000 * i)
        for i, t in enumerate(types)
    ]

    response = client.post("/events", headers=user.headers, json=batch)
    assert response.json() == {"received": 12, "inserted": 12}

    rows = db.execute(
        "select type::text, radio_id::text, radio_position, provider::text, position_ms"
        " from events where user_id = %s and radio_id = %s order by position_ms",
        (user.id, radio["id"]),
    ).fetchall()
    assert rows == [(t, radio["id"], 3, "apple", 1000 * i) for i, t in enumerate(types)]
