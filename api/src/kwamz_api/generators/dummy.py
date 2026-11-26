"""DummyGenerator: the seed's artist first, then ever wider fallbacks until the radio is
full. A placeholder until item2vec (B2); there is no similarity model here."""

import logging
import re
from collections.abc import Callable, Iterator, Sequence
from uuid import UUID

from psycopg.rows import class_row

from kwamz_core.radio import RADIO_LENGTH, Catalog, GeneratorDeps, RadioResult
from kwamz_core.songs import (
    SONG_COLUMNS,
    AppleSong,
    Song,
    SongContext,
    SongId,
    upsert_apple_songs,
)

log = logging.getLogger(__name__)

VERSION = "dummy-v1"
PAGE_SIZE = 25  # Apple search maximum
SEARCH_PAGES = 3
SIMILAR_ARTISTS = 10
CHART_PAGE = 50
CHART_PAGES = 4  # x 50 = 200 songs per chart
DB_FILL_LIMIT = 500

# "A & B", "A, B", "A feat. B", "A ft. B", "A x B", "A with B"
_ARTIST_SPLIT = re.compile(r"\s*(?:&|,|\bfeat\.?|\bft\.?|\bx\b|\bwith\b)\s*", re.IGNORECASE)


def _artists(credit: str) -> set[str]:
    return {a.casefold() for a in _ARTIST_SPLIT.split(credit) if a.strip()}


def _title_key(title: str) -> str:
    """Treats "Song", "Song (Remastered)" and "Song - Single Version" as the same song."""
    return re.split(r"\s+[-(\[]", title.casefold(), maxsplit=1)[0].strip()


class DummyGenerator:
    version = VERSION

    def __init__(self, deps: GeneratorDeps) -> None:
        self._pool = deps.pool
        self._catalog = deps.catalog

    def generate(
        self,
        user_id: UUID,
        seed: Song,
        n: int = RADIO_LENGTH,
        exclude: frozenset[SongId] = frozenset(),
    ) -> RadioResult:
        picker = _Picker(seed, n, exclude)
        for batch in self._sources(seed):
            picker.add(batch)
            if picker.full:
                break
        return RadioResult(tracks=picker.tracks, seed_strategy="direct", model_version=self.version)

    def _sources(self, seed: Song) -> Iterator[list[Song]]:
        """Batches of candidate songs, best first. Lazy: later sources are only queried
        when the earlier ones did not fill the radio."""
        catalog = self._catalog
        context = SongContext()
        if catalog is not None and seed.apple_id:
            apple_id = seed.apple_id
            context = self._call(lambda: catalog.song_context(apple_id), context)
        if catalog is not None:
            yield from self._from_catalog(self._artist_songs(seed, catalog, context))
        yield self._db_artist_songs(seed)
        if catalog is not None:
            yield from self._from_catalog(self._wider_songs(catalog, context))
        yield self._db_any_songs()

    # --- catalog sources, as batches of AppleSong ---------------------------------------

    def _artist_songs(
        self, seed: Song, catalog: Catalog, context: SongContext
    ) -> Iterator[list[AppleSong]]:
        """Songs credited to the seed's artist: search results, then their top songs."""
        wanted = seed.artist.casefold()
        for page in range(SEARCH_PAGES):
            results = self._call(
                lambda p=page: catalog.search_songs(seed.artist, offset=p * PAGE_SIZE), []
            )
            yield [s for s in results if wanted in _artists(s.artist)]
            if len(results) < PAGE_SIZE:
                break
        for artist_id in context.artist_ids:
            yield self._call(lambda a=artist_id: catalog.artist_top_songs(a), [])

    def _wider_songs(self, catalog: Catalog, context: SongContext) -> Iterator[list[AppleSong]]:
        """Similar artists' top songs, then the seed's genre chart, then the overall chart."""
        for artist_id in context.artist_ids[:1]:
            similar = self._call(lambda a=artist_id: catalog.similar_artists(a), [])
            for other in similar[:SIMILAR_ARTISTS]:
                yield self._call(lambda o=other: catalog.artist_top_songs(o), [])
        for genre_id in [*context.genre_ids[:1], None]:
            for page in range(CHART_PAGES):
                songs = self._call(
                    lambda g=genre_id, p=page: catalog.chart_songs(g, CHART_PAGE, p * CHART_PAGE),
                    [],
                )
                yield songs
                if len(songs) < CHART_PAGE:
                    break

    def _from_catalog(self, batches: Iterator[list[AppleSong]]) -> Iterator[list[Song]]:
        """Store catalog songs so they have ids, then hand them on. The upsert commits
        before yielding: the caller may stop iterating at any point."""
        for batch in batches:
            if batch:
                with self._pool.connection() as conn:
                    stored = upsert_apple_songs(conn, batch)
                yield stored

    @staticmethod
    def _call[T](fn: Callable[[], T], default: T) -> T:
        """A failing catalog call skips that source instead of failing the radio."""
        try:
            return fn()
        except Exception:
            log.warning("catalog call failed; skipping source", exc_info=True)
            return default

    # --- database sources ---------------------------------------------------------------

    def _db_artist_songs(self, seed: Song) -> list[Song]:
        return self._query(
            f"select {SONG_COLUMNS} from songs where lower(artist) = lower(%s) order by title, id",
            (seed.artist,),
        )

    def _db_any_songs(self) -> list[Song]:
        """Last resort: anything already known, most recently seen first."""
        return self._query(
            f"select {SONG_COLUMNS} from songs order by updated_at desc, id limit %s",
            (DB_FILL_LIMIT,),
        )

    def _query(self, query: str, params: Sequence[object]) -> list[Song]:
        with self._pool.connection() as conn, conn.cursor(row_factory=class_row(Song)) as cur:
            cur.execute(query, params)  # type: ignore[arg-type]
            return cur.fetchall()


class _Picker:
    """Collects up to n unique songs, skipping the seed, excluded songs and other versions
    of songs already picked."""

    def __init__(self, seed: Song, n: int, exclude: frozenset[SongId]) -> None:
        self._n = n
        self._skip_ids = set(exclude) | {seed.id}
        self._skip_titles = {(_title_key(seed.title), seed.artist.casefold())}
        self.tracks: list[SongId] = []

    @property
    def full(self) -> bool:
        return len(self.tracks) >= self._n

    def add(self, songs: list[Song]) -> None:
        for song in songs:
            if self.full:
                return
            key = (_title_key(song.title), song.artist.casefold())
            if song.id in self._skip_ids or key in self._skip_titles:
                continue
            self._skip_ids.add(song.id)
            self._skip_titles.add(key)
            self.tracks.append(song.id)


def build(deps: GeneratorDeps) -> DummyGenerator:
    return DummyGenerator(deps)
