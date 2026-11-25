"""Request/response models. These define the public API contract (api/openapi.json)."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from kwamz_core.radio import SeedStrategy
from kwamz_core.songs import Song, SongId

type ProviderPreference = Literal["auto", "apple", "youtube"]
type PlaybackProvider = Literal["apple", "youtube"]
type EventType = Literal[
    "play_start",
    "progress",
    "pause",
    "seek",
    "skip",
    "complete",
    "like",
    "unlike",
    "add_to_library",
    "ban",
    "start_radio_from",
    "unavailable",
]
type RadioPosition = Annotated[int, Field(ge=0, le=19)]

MAX_EVENT_BATCH = 500


class SearchResults(BaseModel):
    songs: list[Song]


class CreateRadio(BaseModel):
    seed_song_id: SongId
    parent_radio_id: UUID | None = Field(
        default=None, description='Set for "keep going": continues this radio.'
    )


class RadioTrack(BaseModel):
    position: RadioPosition
    song: Song


class Radio(BaseModel):
    id: UUID
    seed_song: Song
    parent_radio_id: UUID | None
    model_version: str
    seed_strategy: SeedStrategy
    created_at: datetime
    tracks: list[RadioTrack]


class EventIn(BaseModel):
    id: UUID | None = Field(
        default=None, description="Client-generated id; resending the same id is a no-op."
    )
    song_id: SongId
    radio_id: UUID | None = None
    type: EventType
    provider: PlaybackProvider | None = None
    position_ms: Annotated[int, Field(ge=0)] | None = None
    radio_position: RadioPosition | None = None
    client_ts: datetime
    payload: dict[str, Any] = {}


class EventBatchResult(BaseModel):
    received: int
    inserted: int = Field(description="Excludes events whose id was already stored.")


class Me(BaseModel):
    id: UUID
    provider_preference: ProviderPreference
    consent_at: datetime | None
    created_at: datetime


class MeUpdate(BaseModel):
    provider_preference: ProviderPreference
