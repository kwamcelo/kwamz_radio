"""Shared pytest fixtures.

`db_url`: each test session creates a fresh database on the server at DATABASE_URL,
applies the local Supabase shim plus every migration, and drops the database afterwards.
Without a reachable database, DB tests are skipped locally and fail in CI.
"""

import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

SUPABASE_DIR = Path(__file__).resolve().parent / "supabase"
DEFAULT_URL = "postgresql://kwamz:kwamz@localhost:54322/kwamz_radio"


def sql_files() -> list[Path]:
    """Shim first, then migrations, each in filename order."""
    return sorted((SUPABASE_DIR / "local").glob("*.sql")) + sorted(
        (SUPABASE_DIR / "migrations").glob("*.sql")
    )


@pytest.fixture(scope="session")
def db_url() -> Iterator[str]:
    admin_url = os.environ.get("DATABASE_URL", DEFAULT_URL)
    try:
        admin = psycopg.connect(admin_url, autocommit=True, connect_timeout=3)
    except psycopg.OperationalError as exc:
        if os.environ.get("CI"):
            raise
        pytest.skip(f"database not reachable ({exc}); run `docker compose up -d`")

    name = f"kwamz_test_{uuid.uuid4().hex[:12]}"
    admin.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
    url = make_conninfo(admin_url, dbname=name)
    try:
        with psycopg.connect(url, autocommit=True) as conn:
            for path in sql_files():
                conn.execute(path.read_text())  # type: ignore[arg-type]
        yield url
    finally:
        admin.execute(
            sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name))
        )
        admin.close()
