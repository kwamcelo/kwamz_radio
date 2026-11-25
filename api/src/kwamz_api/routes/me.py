from psycopg.rows import class_row

from kwamz_api.auth import UserId
from kwamz_api.db import Conn
from kwamz_api.routes import make_router
from kwamz_api.schemas import Me, MeUpdate

router = make_router("me")

ME_COLUMNS = "id, provider_preference, consent_at, created_at"


@router.get("/me")
def get_me(conn: Conn, user_id: UserId) -> Me:
    with conn.cursor(row_factory=class_row(Me)) as cur:
        cur.execute(f"select {ME_COLUMNS} from users where id = %s", (user_id,))
        me = cur.fetchone()
    assert me is not None  # created by current_user_id
    return me


@router.patch("/me")
def update_me(conn: Conn, user_id: UserId, body: MeUpdate) -> Me:
    with conn.cursor(row_factory=class_row(Me)) as cur:
        cur.execute(
            f"update users set provider_preference = %s where id = %s returning {ME_COLUMNS}",
            (body.provider_preference, user_id),
        )
        me = cur.fetchone()
    assert me is not None
    return me
