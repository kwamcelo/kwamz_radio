"""Current like/ban state. Liking a song clears a ban on it and vice versa.

These only change state; the client logs the matching `like`/`ban`/`unlike` event
separately through POST /events, with its playback context."""

from uuid import UUID

import psycopg
from fastapi import HTTPException, Response, status
from psycopg import errors, sql

from kwamz_api.auth import UserId
from kwamz_api.db import Conn
from kwamz_api.routes import make_router
from kwamz_core.songs import SongId

router = make_router("feedback")


@router.put("/likes/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def like(conn: Conn, user_id: UserId, song_id: SongId) -> Response:
    _set(conn, user_id, song_id, add_to="likes", remove_from="bans")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/likes/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlike(conn: Conn, user_id: UserId, song_id: SongId) -> Response:
    conn.execute("delete from likes where user_id = %s and song_id = %s", (user_id, song_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/bans/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def ban(conn: Conn, user_id: UserId, song_id: SongId) -> Response:
    _set(conn, user_id, song_id, add_to="bans", remove_from="likes")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/bans/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
def unban(conn: Conn, user_id: UserId, song_id: SongId) -> Response:
    conn.execute("delete from bans where user_id = %s and song_id = %s", (user_id, song_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _set(
    conn: psycopg.Connection, user_id: UUID, song_id: SongId, *, add_to: str, remove_from: str
) -> None:
    try:
        conn.execute(
            sql.SQL(
                "insert into {} (user_id, song_id) values (%s, %s) on conflict do nothing"
            ).format(sql.Identifier(add_to)),
            (user_id, song_id),
        )
    except errors.ForeignKeyViolation as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Song not found") from exc
    conn.execute(
        sql.SQL("delete from {} where user_id = %s and song_id = %s").format(
            sql.Identifier(remove_from)
        ),
        (user_id, song_id),
    )
