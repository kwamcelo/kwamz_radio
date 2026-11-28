from typing import Annotated
from uuid import UUID

import psycopg
from fastapi import HTTPException, Query, Request, status
from psycopg import sql

from kwamz_api.auth import UserId
from kwamz_api.db import Conn
from kwamz_api.routes import make_router
from kwamz_api.schemas import CreateRadio, Radio, RadioTrack
from kwamz_core.radio import RADIO_LENGTH, RadioGenerator, RadioResult
from kwamz_core.songs import SongId, get_songs

router = make_router("radios")


@router.post("/radios", status_code=status.HTTP_201_CREATED)
def create_radio(request: Request, conn: Conn, user_id: UserId, body: CreateRadio) -> Radio:
    """Generate a frozen radio of exactly 20 tracks from one seed song."""
    generator: RadioGenerator | None = request.app.state.generator
    if generator is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No radio generator configured")

    seed = get_songs(conn, [body.seed_song_id]).get(body.seed_song_id)
    if seed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seed song not found")

    exclude = {seed.id} | _banned(conn, user_id)
    if body.parent_radio_id is not None:
        if not _owns_radio(conn, user_id, body.parent_radio_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent radio not found")
        exclude |= _tracks_in_chain(conn, body.parent_radio_id)

    result = generator.generate(user_id, seed, n=RADIO_LENGTH, exclude=frozenset(exclude))
    _check_result(result, exclude)

    row = conn.execute(
        "insert into radios (user_id, seed_song_id, parent_radio_id, model_version,"
        " seed_strategy) values (%s, %s, %s, %s, %s) returning id",
        (user_id, seed.id, body.parent_radio_id, result.model_version, result.seed_strategy),
    ).fetchone()
    assert row is not None
    radio_id: UUID = row[0]
    with conn.cursor() as cur:
        cur.executemany(
            "insert into radio_tracks (radio_id, position, song_id) values (%s, %s, %s)",
            [(radio_id, i, song_id) for i, song_id in enumerate(result.tracks)],
        )
    return _load_radios(conn, user_id, radio_id=radio_id)[0]


@router.get("/radios")
def list_radios(
    conn: Conn, user_id: UserId, limit: Annotated[int, Query(ge=1, le=200)] = 50
) -> list[Radio]:
    """The user's saved radios, newest first."""
    return _load_radios(conn, user_id, limit=limit)


@router.get("/radios/{radio_id}")
def get_radio(conn: Conn, user_id: UserId, radio_id: UUID) -> Radio:
    radios = _load_radios(conn, user_id, radio_id=radio_id)
    if not radios:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Radio not found")
    return radios[0]


def _check_result(result: RadioResult, exclude: set[SongId]) -> None:
    """Radios always have exactly RADIO_LENGTH tracks; a generator bug must never produce
    a broken radio."""
    tracks = result.tracks
    if len(tracks) > RADIO_LENGTH or len(set(tracks)) != len(tracks) or exclude & set(tracks):
        raise RuntimeError(f"generator {result.model_version} returned an invalid radio")
    if len(tracks) < RADIO_LENGTH:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"Could not find {RADIO_LENGTH} songs for this radio",
        )


def _banned(conn: psycopg.Connection, user_id: UUID) -> set[SongId]:
    rows = conn.execute("select song_id from bans where user_id = %s", (user_id,)).fetchall()
    return {r[0] for r in rows}


def _owns_radio(conn: psycopg.Connection, user_id: UUID, radio_id: UUID) -> bool:
    row = conn.execute(
        "select 1 from radios where id = %s and user_id = %s", (radio_id, user_id)
    ).fetchone()
    return row is not None


def _tracks_in_chain(conn: psycopg.Connection, radio_id: UUID) -> set[SongId]:
    """Every song already played in this radio and the radios it continues."""
    rows = conn.execute(
        "with recursive chain(id) as ("
        "  select id from radios where id = %s"
        "  union select r.parent_radio_id from radios r join chain c on r.id = c.id"
        "  where r.parent_radio_id is not null"
        ") select t.song_id from radio_tracks t join chain c on t.radio_id = c.id",
        (radio_id,),
    ).fetchall()
    return {r[0] for r in rows}


def _load_radios(
    conn: psycopg.Connection,
    user_id: UUID,
    *,
    radio_id: UUID | None = None,
    limit: int = 1,
) -> list[Radio]:
    radios = conn.execute(
        "select id, seed_song_id, parent_radio_id, model_version, seed_strategy, created_at"
        " from radios where user_id = %s and (%s::uuid is null or id = %s)"
        " order by created_at desc, id limit %s",
        (user_id, radio_id, radio_id, limit),
    ).fetchall()
    if not radios:
        return []
    tracks = conn.execute(
        "select radio_id, position, song_id from radio_tracks"
        " where radio_id = any(%s) order by radio_id, position",
        ([r[0] for r in radios],),
    ).fetchall()
    songs = get_songs(conn, {r[1] for r in radios} | {t[2] for t in tracks})
    track_ids = list({t[2] for t in tracks})
    liked = _user_songs(conn, "likes", user_id, track_ids)
    banned = _user_songs(conn, "bans", user_id, track_ids)

    by_radio: dict[UUID, list[RadioTrack]] = {r[0]: [] for r in radios}
    for rid, position, song_id in tracks:
        by_radio[rid].append(
            RadioTrack(
                position=position,
                song=songs[song_id],
                liked=song_id in liked,
                banned=song_id in banned,
            )
        )
    return [
        Radio(
            id=rid,
            seed_song=songs[seed_id],
            parent_radio_id=parent_id,
            model_version=model_version,
            seed_strategy=seed_strategy,
            created_at=created_at,
            tracks=by_radio[rid],
        )
        for rid, seed_id, parent_id, model_version, seed_strategy, created_at in radios
    ]


def _user_songs(
    conn: psycopg.Connection, table: str, user_id: UUID, song_ids: list[SongId]
) -> set[SongId]:
    """Which of these songs the user has in `likes` or `bans`."""
    rows = conn.execute(
        sql.SQL("select song_id from {} where user_id = %s and song_id = any(%s)").format(
            sql.Identifier(table)
        ),
        (user_id, song_ids),
    ).fetchall()
    return {r[0] for r in rows}
