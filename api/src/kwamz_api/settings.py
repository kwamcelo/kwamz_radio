from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read from the environment (and `.env` at the repo root when run from there)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://kwamz:kwamz@localhost:54322/kwamz_radio"

    # Supabase Auth. Tokens are verified against the project's JWKS.
    supabase_url: str = ""

    # Apple Music developer token (ES256, signed with the MusicKit .p8 key).
    apple_team_id: str = ""
    apple_musickit_key_id: str = ""
    apple_musickit_private_key_path: Path | None = None
    apple_music_storefront: str = "ca"

    # Which RadioGenerator builds radios: "dummy", "package.module:factory", or "" for none.
    radio_generator: str = "dummy"

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
