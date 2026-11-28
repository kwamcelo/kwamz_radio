"""Database access. The API connects as the service role and scopes every query to the
authenticated user itself; RLS is a second line of defence for direct client access."""

from collections.abc import Iterator
from typing import Annotated

import psycopg
from fastapi import Depends, Request
from psycopg_pool import ConnectionPool


def create_pool(database_url: str) -> ConnectionPool:
    return ConnectionPool(
        database_url,
        min_size=1,
        max_size=10,
        open=False,
        # Test each connection before handing it out: pooled connections die when the
        # network changes or the database restarts, and would otherwise fail a request.
        check=ConnectionPool.check_connection,
        kwargs={"application_name": "kwamz-api"},
    )


def get_conn(request: Request) -> Iterator[psycopg.Connection]:
    """One transaction per request: committed on success, rolled back on error."""
    pool: ConnectionPool = request.app.state.pool
    with pool.connection() as conn:
        yield conn


Conn = Annotated[psycopg.Connection, Depends(get_conn)]
