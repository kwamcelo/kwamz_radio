from collections.abc import Iterator

import psycopg
import pytest


@pytest.fixture
def conn(db_url: str) -> Iterator[psycopg.Connection]:
    """A connection whose transaction is rolled back after the test."""
    with psycopg.connect(db_url) as connection:
        yield connection
        connection.rollback()
