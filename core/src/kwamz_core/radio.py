"""The RadioGenerator contract. Changes need owner approval.

Implementations live in their own modules and are chosen by config (RADIO_GENERATOR):
either a built-in name ("dummy") or an import path "package.module:factory", where the
factory takes a GeneratorDeps and returns a RadioGenerator. Every implementation must
pass the shared suite in kwamz_core.testing.generator_contract.
"""

from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

from psycopg_pool import ConnectionPool

from kwamz_core.songs import AppleSong, Song, SongContext, SongId

type SeedStrategy = Literal[
    "direct", "fallback_artist", "fallback_similar_artist", "fallback_genre"
]

SEED_STRATEGIES: frozenset[str] = frozenset(
    {"direct", "fallback_artist", "fallback_similar_artist", "fallback_genre"}
)
RADIO_LENGTH = 20


@dataclass(frozen=True)
class RadioResult:
    tracks: list[SongId]
    seed_strategy: SeedStrategy
    model_version: str


class RadioGenerator(Protocol):
    version: str

    def generate(
        self,
        user_id: UUID,
        seed: Song,
        n: int = RADIO_LENGTH,
        exclude: frozenset[SongId] = frozenset(),
    ) -> RadioResult:
        """Return exactly n unique songs, all present in `songs`, never the seed or anything
        in `exclude`. A generator must have fallbacks that make running out practically
        impossible; the API refuses to save a radio with fewer than n tracks."""
        ...


class Catalog(Protocol):
    """A music catalog (the Apple Music client implements this). Ids are catalog ids.
    Methods may raise any exception when the catalog is unreachable."""

    def search_songs(self, term: str, limit: int = 25, offset: int = 0) -> list[AppleSong]: ...

    def song_context(self, apple_id: str) -> SongContext: ...

    def artist_top_songs(self, artist_id: str) -> list[AppleSong]: ...

    def similar_artists(self, artist_id: str) -> list[str]: ...

    def chart_songs(
        self, genre_id: str | None = None, limit: int = 50, offset: int = 0
    ) -> list[AppleSong]: ...


@dataclass(frozen=True)
class GeneratorDeps:
    """What a generator factory is given. `catalog` is None when Apple Music isn't set up."""

    pool: ConnectionPool
    catalog: Catalog | None
