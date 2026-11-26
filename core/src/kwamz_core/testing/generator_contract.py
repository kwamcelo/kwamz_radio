"""Shared test suite every RadioGenerator must pass.

Usage, in any test module:

    class TestMyGeneratorContract(GeneratorContract):
        @pytest.fixture
        def case(self, ...) -> GeneratorCase:
            ...  # arrange data; return the generator and a seed with enough candidates

The base class has no `Test` prefix, so pytest only runs it through subclasses.
"""

import uuid
from dataclasses import dataclass

import psycopg
import pytest

from kwamz_core.radio import RADIO_LENGTH, SEED_STRATEGIES, RadioGenerator, RadioResult
from kwamz_core.songs import Song, SongId

EXTRA = 5


@dataclass
class GeneratorCase:
    """A generator plus a seed with at least RADIO_LENGTH + EXTRA songs it can return."""

    generator: RadioGenerator
    seed: Song
    db_url: str


class GeneratorContract:
    @pytest.fixture
    def case(self) -> GeneratorCase:
        raise NotImplementedError("define a `case` fixture in the subclass")

    @staticmethod
    def run(
        case: GeneratorCase, n: int = RADIO_LENGTH, exclude: frozenset[SongId] = frozenset()
    ) -> RadioResult:
        return case.generator.generate(uuid.uuid4(), case.seed, n=n, exclude=exclude)

    def test_returns_exactly_n_unique_songs(self, case: GeneratorCase) -> None:
        result = self.run(case)
        assert len(result.tracks) == RADIO_LENGTH
        assert len(set(result.tracks)) == RADIO_LENGTH

    def test_respects_smaller_n(self, case: GeneratorCase) -> None:
        result = self.run(case, n=5)
        assert len(result.tracks) == 5
        assert len(set(result.tracks)) == 5

    def test_never_returns_the_seed(self, case: GeneratorCase) -> None:
        assert case.seed.id not in self.run(case).tracks

    def test_honours_exclude(self, case: GeneratorCase) -> None:
        banned = frozenset(self.run(case).tracks[:EXTRA])
        result = self.run(case, exclude=banned)
        assert not banned & set(result.tracks)
        assert len(result.tracks) == RADIO_LENGTH  # still fills the radio

    def test_excluding_everything_returns_nothing_excluded(self, case: GeneratorCase) -> None:
        everything = frozenset(self.run(case, n=RADIO_LENGTH + EXTRA).tracks)
        result = self.run(case, exclude=everything)
        assert not everything & set(result.tracks)
        assert len(set(result.tracks)) == len(result.tracks) <= RADIO_LENGTH

    def test_sets_metadata(self, case: GeneratorCase) -> None:
        result = self.run(case)
        assert result.model_version == case.generator.version
        assert result.model_version
        assert result.seed_strategy in SEED_STRATEGIES

    def test_tracks_are_stored_songs(self, case: GeneratorCase) -> None:
        tracks = self.run(case).tracks
        with psycopg.connect(case.db_url) as conn:
            row = conn.execute(
                "select count(*) from songs where id = any(%s)", (tracks,)
            ).fetchone()
        assert row == (len(tracks),)
