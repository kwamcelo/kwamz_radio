# S0-3 — API skeleton & OpenAPI contract

**Depends on:** S0-2. **Contract — changes need owner approval.**

## Endpoints (v1)
- `GET /search?q=` → Apple Music catalog search (developer token signed server-side), returns songs upserted into `songs`.
- `POST /radios` `{seed_song_id, parent_radio_id?}` → creates a frozen 20-track radio via `RadioGenerator`.
- `GET /radios`, `GET /radios/{id}` → saved radios with tracks.
- `POST /events` → batch of events (array) for offline-tolerant clients.
- `PUT /likes/{song_id}`, `DELETE /likes/{song_id}`, `PUT /bans/{song_id}`, `DELETE /bans/{song_id}`.
- `GET /me`, `PATCH /me` (provider_preference).
- `GET /health`.

## Scope
- Supabase JWT verification middleware.
- Apple developer-token generation (ES256 with the .p8 key), cached until expiry.
- Commit `api/openapi.json`; script to regenerate it; generate a typed TS client into `app/src/api/` (e.g. openapi-typescript).

## Done when
- pytest covers auth rejection, radio creation (with dummy generator), event batch insert.
- `make contracts` regenerates OpenAPI + TS client with no diff on a clean tree.
