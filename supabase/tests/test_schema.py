import json
import uuid

import psycopg
import pytest
from psycopg import errors, sql

EXPECTED_TABLES = {
    "users",
    "songs",
    "artists",
    "radios",
    "radio_tracks",
    "events",
    "likes",
    "bans",
    "imports",
    "model_versions",
}


# --- helpers ---------------------------------------------------------------


def make_user(conn: psycopg.Connection) -> uuid.UUID:
    user_id = uuid.uuid4()
    conn.execute("insert into auth.users (id) values (%s)", (user_id,))
    conn.execute("insert into users (id) values (%s)", (user_id,))
    return user_id


def make_song(conn: psycopg.Connection, title: str = "Song") -> uuid.UUID:
    row = conn.execute(
        "insert into songs (title, artist) values (%s, 'Artist') returning id", (title,)
    ).fetchone()
    assert row is not None
    return row[0]


def make_radio(conn: psycopg.Connection, user_id: uuid.UUID, tracks: int = 20) -> uuid.UUID:
    seed = make_song(conn, "Seed")
    row = conn.execute(
        "insert into radios (user_id, seed_song_id, model_version, seed_strategy)"
        " values (%s, %s, 'dummy', 'direct') returning id",
        (user_id, seed),
    ).fetchone()
    assert row is not None
    radio_id = row[0]
    for position in range(tracks):
        conn.execute(
            "insert into radio_tracks (radio_id, position, song_id) values (%s, %s, %s)",
            (radio_id, position, make_song(conn, f"Track {position}")),
        )
    return radio_id


def make_event(conn: psycopg.Connection, user_id: uuid.UUID) -> None:
    conn.execute(
        "insert into events (user_id, song_id, type, provider, client_ts)"
        " values (%s, %s, 'play_start', 'apple', now())",
        (user_id, make_song(conn)),
    )


def act_as(conn: psycopg.Connection, user_id: uuid.UUID) -> None:
    """Switch the transaction to a signed-in Supabase user, as PostgREST does."""
    conn.execute("set local role authenticated")
    conn.execute(
        "select set_config('request.jwt.claims', %s, true)",
        (json.dumps({"sub": str(user_id), "role": "authenticated"}),),
    )


# --- migrations ------------------------------------------------------------


def test_migrations_create_all_tables(conn: psycopg.Connection) -> None:
    rows = conn.execute("select tablename from pg_tables where schemaname = 'public'").fetchall()
    assert {r[0] for r in rows} == EXPECTED_TABLES


def test_rls_enabled_on_every_table(conn: psycopg.Connection) -> None:
    rows = conn.execute(
        "select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace"
        " where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity"
    ).fetchall()
    assert rows == []


# --- radio_tracks ----------------------------------------------------------


def test_radio_tracks_cannot_be_updated(conn: psycopg.Connection) -> None:
    radio_id = make_radio(conn, make_user(conn))
    count = conn.execute(
        "select count(*) from radio_tracks where radio_id = %s", (radio_id,)
    ).fetchone()
    assert count == (20,)

    other_song = make_song(conn, "Replacement")
    with pytest.raises(errors.RestrictViolation):
        conn.execute(
            "update radio_tracks set song_id = %s where radio_id = %s and position = 0",
            (other_song, radio_id),
        )


def test_radio_has_at_most_20_positions(conn: psycopg.Connection) -> None:
    radio_id = make_radio(conn, make_user(conn))
    with pytest.raises(errors.CheckViolation):
        conn.execute(
            "insert into radio_tracks (radio_id, position, song_id) values (%s, 20, %s)",
            (radio_id, make_song(conn)),
        )


def test_deleting_a_radio_deletes_its_tracks(conn: psycopg.Connection) -> None:
    radio_id = make_radio(conn, make_user(conn))
    conn.execute("delete from radios where id = %s", (radio_id,))
    count = conn.execute(
        "select count(*) from radio_tracks where radio_id = %s", (radio_id,)
    ).fetchone()
    assert count == (0,)


# --- model_versions --------------------------------------------------------


def test_only_one_active_model_per_kind(conn: psycopg.Connection) -> None:
    conn.execute("insert into model_versions (id, kind, is_active) values ('a', 'reranker', true)")
    conn.execute("insert into model_versions (id, kind, is_active) values ('b', 'item2vec', true)")
    with pytest.raises(errors.UniqueViolation):
        conn.execute(
            "insert into model_versions (id, kind, is_active) values ('c', 'reranker', true)"
        )


# --- RLS -------------------------------------------------------------------


def test_user_cannot_read_other_users_events(conn: psycopg.Connection) -> None:
    user_a, user_b = make_user(conn), make_user(conn)
    make_event(conn, user_a)
    make_event(conn, user_b)

    act_as(conn, user_a)
    rows = conn.execute("select user_id from events").fetchall()
    assert rows == [(user_a,)]


def test_user_cannot_write_events_as_another_user(conn: psycopg.Connection) -> None:
    user_a, user_b = make_user(conn), make_user(conn)
    song = make_song(conn)

    act_as(conn, user_a)
    with pytest.raises(errors.InsufficientPrivilege):
        conn.execute(
            "insert into events (user_id, song_id, type, client_ts) values (%s, %s, 'like', now())",
            (user_b, song),
        )


def test_user_only_sees_own_radios_and_tracks(conn: psycopg.Connection) -> None:
    user_a, user_b = make_user(conn), make_user(conn)
    radio_a = make_radio(conn, user_a, tracks=2)
    make_radio(conn, user_b, tracks=2)

    act_as(conn, user_a)
    assert conn.execute("select id from radios").fetchall() == [(radio_a,)]
    assert conn.execute("select distinct radio_id from radio_tracks").fetchall() == [(radio_a,)]


def test_signed_in_user_can_read_catalog(conn: psycopg.Connection) -> None:
    user = make_user(conn)
    make_song(conn)

    act_as(conn, user)
    count = conn.execute("select count(*) from songs").fetchone()
    assert count is not None and count[0] >= 1


def test_service_role_bypasses_rls(conn: psycopg.Connection) -> None:
    users = [make_user(conn), make_user(conn)]
    for user_id in users:
        make_event(conn, user_id)

    conn.execute("set local role service_role")
    count = conn.execute("select count(*) from events where user_id = any(%s)", (users,)).fetchone()
    assert count == (2,)


@pytest.mark.parametrize("table", ["likes", "bans"])
def test_user_only_sees_and_changes_own_likes_and_bans(
    conn: psycopg.Connection, table: str
) -> None:
    t = sql.Identifier(table)
    insert = sql.SQL("insert into {} (user_id, song_id) values (%s, %s)").format(t)
    user_a, user_b = make_user(conn), make_user(conn)
    song = make_song(conn)
    for user in (user_a, user_b):
        conn.execute(insert, (user, song))

    act_as(conn, user_a)
    assert conn.execute(sql.SQL("select user_id from {}").format(t)).fetchall() == [(user_a,)]
    conn.execute(sql.SQL("delete from {} where user_id = %s").format(t), (user_b,))  # no-op
    with pytest.raises(errors.InsufficientPrivilege), conn.transaction():  # savepoint
        conn.execute(insert, (user_b, song))

    conn.execute("reset role")
    count = conn.execute(
        sql.SQL("select count(*) from {} where user_id = %s").format(t), (user_b,)
    ).fetchone()
    assert count == (1,)
