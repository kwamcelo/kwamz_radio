import uuid
from typing import Annotated

from fastapi import Body, HTTPException, status
from psycopg import errors
from psycopg.types.json import Jsonb

from kwamz_api.auth import UserId
from kwamz_api.db import Conn
from kwamz_api.routes import make_router
from kwamz_api.schemas import MAX_EVENT_BATCH, EventBatchResult, EventIn

router = make_router("events")


@router.post("/events")
def log_events(
    conn: Conn,
    user_id: UserId,
    events: Annotated[list[EventIn], Body(min_length=1, max_length=MAX_EVENT_BATCH)],
) -> EventBatchResult:
    """Store a batch of raw playback/feedback events. Safe to retry: events whose `id` is
    already stored are skipped."""
    radio_ids = list({e.radio_id for e in events if e.radio_id is not None})
    if radio_ids:
        owned = conn.execute(
            "select count(*) from radios where id = any(%s) and user_id = %s",
            (radio_ids, user_id),
        ).fetchone()
        if owned is None or owned[0] != len(radio_ids):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown radio_id")

    inserted = 0
    try:
        with conn.cursor() as cur:
            for e in events:
                cur.execute(
                    "insert into events (id, user_id, song_id, radio_id, type, provider,"
                    " position_ms, radio_position, client_ts, payload)"
                    " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
                    " on conflict (id) do nothing",
                    (
                        e.id or uuid.uuid4(),
                        user_id,
                        e.song_id,
                        e.radio_id,
                        e.type,
                        e.provider,
                        e.position_ms,
                        e.radio_position,
                        e.client_ts,
                        Jsonb(e.payload),
                    ),
                )
                inserted += cur.rowcount
    except errors.ForeignKeyViolation as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown song_id") from exc
    return EventBatchResult(received=len(events), inserted=inserted)
