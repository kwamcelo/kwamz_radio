from collections.abc import Callable

import psycopg
from fastapi.testclient import TestClient

from .conftest import User


def test_requests_survive_dropped_database_connections(
    make_client: Callable[..., TestClient], user: User, db: psycopg.Connection
) -> None:
    """Pooled connections die when the network changes (e.g. the Mac switches Wi-Fi) or
    the database restarts; the next request must get a fresh one instead of a 500."""
    client = make_client(raise_server_exceptions=False)
    assert client.get("/me", headers=user.headers).status_code == 200

    killed = db.execute(
        "select count(pg_terminate_backend(pid)) from pg_stat_activity"
        " where application_name = 'kwamz-api' and datname = current_database()"
    ).fetchone()
    assert killed is not None and killed[0] >= 1

    assert client.get("/me", headers=user.headers).status_code == 200
