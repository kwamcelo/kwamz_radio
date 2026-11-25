"""The RadioGenerator contract (S0-4). Implementations live in their own modules."""

from dataclasses import dataclass
from typing import Literal, Protocol
from uuid import UUID

from kwamz_core.songs import Song, SongId

type SeedStrategy = Literal[
    "direct", "fallback_artist", "fallback_similar_artist", "fallback_genre"
]

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
    ) -> RadioResult: ...
