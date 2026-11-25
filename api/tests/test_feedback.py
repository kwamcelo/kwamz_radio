import uuid

import psycopg
from fastapi.testclient import TestClient

from kwamz_core.songs import SongId

from .conftest import User


def state(db: psycopg.Connection, user: User, song: SongId) -> tuple[bool, bool]:
    row = db.execute(
        "select exists(select 1 from likes where user_id = %(u)s and song_id = %(s)s),"
        " exists(select 1 from bans where user_id = %(u)s and song_id = %(s)s)",
        {"u": user.id, "s": song},
    ).fetchone()
    assert row is not None
    return row[0], row[1]


def test_like_ban_round_trip(
    client: TestClient, user: User, catalog: list[SongId], db: psycopg.Connection
) -> None:
    song = catalog[0]
    h = user.headers

    assert client.put(f"/likes/{song}", headers=h).status_code == 204
    assert client.put(f"/likes/{song}", headers=h).status_code == 204  # idempotent
    assert state(db, user, song) == (True, False)

    assert client.put(f"/bans/{song}", headers=h).status_code == 204
    assert state(db, user, song) == (False, True)  # ban clears like

    assert client.put(f"/likes/{song}", headers=h).status_code == 204
    assert state(db, user, song) == (True, False)  # like clears ban

    assert client.delete(f"/likes/{song}", headers=h).status_code == 204
    assert client.delete(f"/bans/{song}", headers=h).status_code == 204
    assert state(db, user, song) == (False, False)


def test_unknown_song_is_404(client: TestClient, user: User) -> None:
    assert client.put(f"/likes/{uuid.uuid4()}", headers=user.headers).status_code == 404
    assert client.put(f"/bans/{uuid.uuid4()}", headers=user.headers).status_code == 404
