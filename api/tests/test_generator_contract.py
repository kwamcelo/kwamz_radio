"""DummyGenerator against the shared RadioGenerator contract, plus its own behaviour."""

import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field

import psycopg
import pytest
from psycopg_pool import ConnectionPool

from kwamz_api.generators import load_generator
from kwamz_api.generators.dummy import DummyGenerator
from kwamz_core.radio import GeneratorDeps
from kwamz_core.songs import AppleSong, Song, SongContext, get_songs
from kwamz_core.testing.generator_contract import GeneratorCase, GeneratorContract


@dataclass
class FakeCatalog:
    """In-memory stand-in for Apple Music. Methods named in `failing` raise."""

    search: list[AppleSong] = field(default_factory=list)
    context: SongContext = field(default_factory=SongContext)
    top: dict[str, list[AppleSong]] = field(default_factory=dict)
    similar: dict[str, list[str]] = field(default_factory=dict)
    charts: dict[str | None, list[AppleSong]] = field(default_factory=dict)
    failing: set[str] = field(default_factory=set)
    calls: list[tuple[str, object]] = field(default_factory=list)

    def _record(self, method: str, arg: object) -> None:
        self.calls.append((method, arg))
        if method in self.failing:
            raise ConnectionError(f"{method} is down")

    def search_songs(self, term: str, limit: int = 25, offset: int = 0) -> list[AppleSong]:
        self._record("search_songs", offset)
        return self.search[offset : offset + limit]

    def song_context(self, apple_id: str) -> SongContext:
        self._record("song_context", apple_id)
        return self.context

    def artist_top_songs(self, artist_id: str) -> list[AppleSong]:
        self._record("artist_top_songs", artist_id)
        return self.top.get(artist_id, [])

    def similar_artists(self, artist_id: str) -> list[str]:
        self._record("similar_artists", artist_id)
        return self.similar.get(artist_id, [])

    def chart_songs(
        self, genre_id: str | None = None, limit: int = 50, offset: int = 0
    ) -> list[AppleSong]:
        self._record("chart_songs", (genre_id, offset))
        return self.charts.get(genre_id, [])[offset : offset + limit]


def apple_song(title: str, artist: str) -> AppleSong:
    return AppleSong(apple_id=f"a{uuid.uuid4().hex[:12]}", title=title, artist=artist)


def songs(prefix: str, artist: str, count: int) -> list[AppleSong]:
    return [apple_song(f"{prefix} {i}", artist) for i in range(count)]


@pytest.fixture
def pool(db_url: str) -> Iterator[ConnectionPool]:
    with ConnectionPool[psycopg.Connection](db_url, min_size=1, max_size=4) as p:
        yield p


@pytest.fixture
def db(db_url: str) -> Iterator[psycopg.Connection]:
    with psycopg.connect(db_url, autocommit=True) as conn:
        yield conn


@pytest.fixture
def artist() -> str:
    return f"Artist {uuid.uuid4().hex[:6]}"


def make_seed(
    db: psycopg.Connection, artist: str, title: str = "Seed Song", apple_id: str | None = None
) -> Song:
    row = db.execute(
        "insert into songs (title, artist, apple_id) values (%s, %s, %s) returning id",
        (title, artist, apple_id),
    ).fetchone()
    assert row is not None
    return get_songs(db, [row[0]])[row[0]]


def run(pool: ConnectionPool, catalog: FakeCatalog | None, seed: Song) -> list[Song]:
    result = DummyGenerator(GeneratorDeps(pool=pool, catalog=catalog)).generate(uuid.uuid4(), seed)
    with pool.connection() as conn:
        found = get_songs(conn, result.tracks)
    return [found[i] for i in result.tracks]


# --- the shared contract ---------------------------------------------------------------


class TestDummyWithCatalogContract(GeneratorContract):
    @pytest.fixture
    def case(
        self, db_url: str, db: psycopg.Connection, pool: ConnectionPool, artist: str
    ) -> GeneratorCase:
        catalog = FakeCatalog(search=songs("Track", artist, 40))
        generator = DummyGenerator(GeneratorDeps(pool=pool, catalog=catalog))
        return GeneratorCase(generator, make_seed(db, artist), db_url)


class TestDummyWithoutCatalogContract(GeneratorContract):
    @pytest.fixture
    def case(
        self, db_url: str, db: psycopg.Connection, pool: ConnectionPool, artist: str
    ) -> GeneratorCase:
        for i in range(30):
            db.execute("insert into songs (title, artist) values (%s, %s)", (f"Track {i}", artist))
        generator = DummyGenerator(GeneratorDeps(pool=pool, catalog=None))
        return GeneratorCase(generator, make_seed(db, artist), db_url)


# --- artist matching -------------------------------------------------------------------


def test_only_songs_credited_to_the_seed_artist_come_first(
    db: psycopg.Connection, pool: ConnectionPool, artist: str
) -> None:
    catalog = FakeCatalog(
        search=[
            apple_song("Mine", artist),
            apple_song("Collab", f"{artist} & Someone"),
            apple_song("Featured", f"Someone feat. {artist}"),
            apple_song("Not Mine", f"{artist} Tribute Band"),
            apple_song("Other", "Someone Else"),
        ],
        charts={None: songs("Chart", "Chart Artist", 50)},
    )
    picked = run(pool, catalog, make_seed(db, artist))

    assert [s.title for s in picked[:3]] == ["Mine", "Collab", "Featured"]
    assert "Not Mine" not in {s.title for s in picked}


def test_skips_other_versions_of_the_same_song(
    db: psycopg.Connection, pool: ConnectionPool, artist: str
) -> None:
    catalog = FakeCatalog(
        search=[
            apple_song("Seed Song (Live)", artist),  # a version of the seed
            apple_song("Hit", artist),
            apple_song("Hit - Single Version", artist),
            apple_song("Hit (2019 Remaster)", artist),
            apple_song("Other Hit", artist),
        ],
        charts={None: songs("Chart", "Chart Artist", 50)},
    )
    picked = run(pool, catalog, make_seed(db, artist))

    assert [s.title for s in picked[:2]] == ["Hit", "Other Hit"]
    assert not {"Seed Song (Live)", "Hit - Single Version"} & {s.title for s in picked}


# --- always 20: fallbacks --------------------------------------------------------------


def test_fills_from_wider_sources_in_order(
    db: psycopg.Connection, pool: ConnectionPool, artist: str
) -> None:
    catalog = FakeCatalog(
        search=songs("Own", artist, 3),
        context=SongContext(artist_ids=["art1"], genre_ids=["g1"]),
        top={"art1": songs("Top", artist, 2), "sim1": songs("Sim", "Similar", 4)},
        similar={"art1": ["sim1"]},
        charts={"g1": songs("Genre", "Genre Artist", 5), None: songs("Chart", "Chart Artist", 50)},
    )
    picked = run(pool, catalog, make_seed(db, artist, apple_id=f"seed{uuid.uuid4().hex[:8]}"))

    assert len(picked) == 20
    sources = [s.title.split()[0] for s in picked]
    assert sources == ["Own"] * 3 + ["Top"] * 2 + ["Sim"] * 4 + ["Genre"] * 5 + ["Chart"] * 6


def test_stops_querying_once_full(
    db: psycopg.Connection, pool: ConnectionPool, artist: str
) -> None:
    noise = songs("Noise", "Someone Else", 20)
    catalog = FakeCatalog(search=noise + songs("Track", artist, 30))
    run(pool, catalog, make_seed(db, artist))

    # Page 1 holds 5 of the artist's songs, page 2 fills the radio; nothing else is asked.
    assert catalog.calls == [("search_songs", 0), ("search_songs", 25)]


def test_failing_catalog_calls_are_skipped(
    db: psycopg.Connection, pool: ConnectionPool, artist: str
) -> None:
    catalog = FakeCatalog(
        search=songs("Own", artist, 3),
        context=SongContext(artist_ids=["art1"]),
        similar={"art1": ["sim1"]},
        top={"sim1": songs("Sim", "Similar", 5)},
        charts={None: songs("Chart", "Chart Artist", 50)},
        failing={"artist_top_songs"},
    )
    picked = run(pool, catalog, make_seed(db, artist, apple_id=f"seed{uuid.uuid4().hex[:8]}"))

    assert len(picked) == 20
    assert {s.title.split()[0] for s in picked} == {"Own", "Chart"}


def test_catalog_down_falls_back_to_known_songs(
    db: psycopg.Connection, pool: ConnectionPool, artist: str
) -> None:
    for i in range(25):
        db.execute("insert into songs (title, artist) values (%s, 'Anyone')", (f"Known {i}",))
    catalog = FakeCatalog(failing={"search_songs", "chart_songs"})
    picked = run(pool, catalog, make_seed(db, artist))

    assert len(picked) == 20


def test_without_catalog_artist_songs_come_before_any_songs(
    db: psycopg.Connection, pool: ConnectionPool, artist: str
) -> None:
    for i in range(3):
        db.execute("insert into songs (title, artist) values (%s, %s)", (f"Own {i}", artist))
    for i in range(25):
        db.execute("insert into songs (title, artist) values (%s, 'Anyone')", (f"Known {i}",))
    picked = run(pool, None, make_seed(db, artist))

    assert len(picked) == 20
    assert [s.title for s in picked[:3]] == ["Own 0", "Own 1", "Own 2"]


# --- config ----------------------------------------------------------------------------


def test_load_generator_from_config(pool: ConnectionPool) -> None:
    deps = GeneratorDeps(pool=pool, catalog=None)
    assert isinstance(load_generator("dummy", deps), DummyGenerator)
    assert isinstance(load_generator("kwamz_api.generators.dummy:build", deps), DummyGenerator)
    assert load_generator("", deps) is None
    with pytest.raises(ValueError, match="RADIO_GENERATOR"):
        load_generator("item2vec", deps)
