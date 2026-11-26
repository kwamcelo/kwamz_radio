"""The `songs` catalog: the shared Song model and DB access for it."""

from collections.abc import Iterable, Sequence
from uuid import UUID

import psycopg
from psycopg.rows import class_row
from pydantic import BaseModel

type SongId = UUID

SONG_COLUMNS = "id, mbid, isrc, apple_id, title, artist, artist_mbid, duration_ms, genres"


class Song(BaseModel):
    id: SongId
    mbid: UUID | None = None
    isrc: str | None = None
    apple_id: str | None = None
    title: str
    artist: str
    artist_mbid: UUID | None = None
    duration_ms: int | None = None
    genres: list[str] = []


class AppleSong(BaseModel):
    """A song as found in the Apple Music catalog, before it has a `songs` row."""

    apple_id: str
    title: str
    artist: str
    isrc: str | None = None
    duration_ms: int | None = None
    genres: list[str] = []


class SongContext(BaseModel):
    """Catalog ids related to a song, used to look for similar music."""

    artist_ids: list[str] = []
    genre_ids: list[str] = []


def get_songs(conn: psycopg.Connection, ids: Iterable[SongId]) -> dict[SongId, Song]:
    with conn.cursor(row_factory=class_row(Song)) as cur:
        cur.execute(f"select {SONG_COLUMNS} from songs where id = any(%s)", (list(ids),))
        return {song.id: song for song in cur.fetchall()}


def upsert_apple_songs(conn: psycopg.Connection, found: Sequence[AppleSong]) -> list[Song]:
    """Insert or refresh songs by Apple catalog ID. Returns them in the input order.

    MBID-related columns are left alone: they are filled in by the song resolver (C1).
    """
    if not found:
        return []
    songs: list[Song] = []
    with conn.cursor(row_factory=class_row(Song)) as cur:
        for s in found:
            cur.execute(
                "insert into songs (apple_id, title, artist, isrc, duration_ms, genres)"
                " values (%s, %s, %s, %s, %s, %s)"
                " on conflict (apple_id) do update set"
                "   title = excluded.title,"
                "   artist = excluded.artist,"
                "   isrc = coalesce(excluded.isrc, songs.isrc),"
                "   duration_ms = coalesce(excluded.duration_ms, songs.duration_ms),"
                "   genres = excluded.genres"
                f" returning {SONG_COLUMNS}",
                (s.apple_id, s.title, s.artist, s.isrc, s.duration_ms, s.genres),
            )
            row = cur.fetchone()
            assert row is not None
            songs.append(row)
    return songs
