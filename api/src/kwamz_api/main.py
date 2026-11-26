from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from kwamz_api.apple import AppleMusicClient, DeveloperTokenProvider
from kwamz_api.auth import TokenVerifier
from kwamz_api.db import create_pool
from kwamz_api.generators import load_generator
from kwamz_api.routes import events, feedback, me, operation_id, radios, search
from kwamz_api.settings import Settings, get_settings
from kwamz_core.radio import GeneratorDeps, RadioGenerator


def create_app(
    settings: Settings | None = None,
    *,
    token_verifier: TokenVerifier | None = None,
    apple: AppleMusicClient | None = None,
    generator: RadioGenerator | None = None,
) -> FastAPI:
    """Build the app. Collaborators default to ones built from settings; tests pass fakes."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.pool.open()
        try:
            yield
        finally:
            app.state.pool.close()

    app = FastAPI(
        title="kwamz_radio API",
        version="0.1.0",
        lifespan=lifespan,
        generate_unique_id_function=operation_id,
    )
    app.state.pool = create_pool(settings.database_url)
    app.state.token_verifier = token_verifier or TokenVerifier.from_jwks(
        settings.supabase_jwks_url, settings.supabase_issuer
    )
    app.state.apple = apple or _apple_from_settings(settings)
    app.state.generator = generator or load_generator(
        settings.radio_generator, GeneratorDeps(pool=app.state.pool, catalog=app.state.apple)
    )

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    for module in (search, radios, events, feedback, me):
        app.include_router(module.router)
    return app


def _apple_from_settings(settings: Settings) -> AppleMusicClient | None:
    key_path = settings.apple_musickit_private_key_path
    if not (settings.apple_team_id and settings.apple_musickit_key_id and key_path):
        return None
    tokens = DeveloperTokenProvider(
        settings.apple_team_id, settings.apple_musickit_key_id, key_path.read_text()
    )
    return AppleMusicClient(tokens, settings.apple_music_storefront)


app = create_app()
