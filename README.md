# kwamz_radio

Radio-style playlists from a single seed song, powered by a recommendation model trained on public listening data, personal listening history, and in-app behaviour.

- Design: [docs/design.md](docs/design.md)
- Tickets: [docs/tickets/README.md](docs/tickets/README.md) (mirrored as GitHub issues)

## Layout

| Path | What |
|---|---|
| `app/` | Expo (React Native + TypeScript) mobile app |
| `api/` | FastAPI backend (`kwamz_api`) |
| `ml/` | Model training and evaluation (`kwamz_ml`) |
| `pipeline/` | Data import and song matching (`kwamz_pipeline`) |
| `core/` | Shared Python code (`kwamz_core`) |
| `supabase/migrations/` | SQL migrations |

## Prerequisites

- Node 22+ and pnpm (`corepack enable`; the version is pinned in `package.json`)
- [uv](https://docs.astral.sh/uv/) for Python
- Docker (Docker Desktop or OrbStack)

## Setup

```bash
cp .env.example .env   # then fill in your values
pnpm install
uv sync
docker compose up -d   # Postgres 16 + pgvector on localhost:54322
```

Migrations in `supabase/migrations/` run automatically the first time the database volume is created, after `supabase/local/` (a local-only stand-in for Supabase's `auth` schema and roles; never applied to real Supabase). After adding a migration, recreate the volume: `docker compose down -v && docker compose up -d`.

Schema tests (`supabase/tests/`) create and drop their own throwaway database on that server, so they always test the migrations from scratch. They're skipped if no database is running (and fail in CI).

## Run

```bash
uv run uvicorn kwamz_api.main:app --reload   # API on http://localhost:8000
pnpm --filter @kwamz-radio/app start         # Expo dev server
```

### On an iPhone

The app needs a development build (MusicKit and the sign-in sheets are native code, so Expo Go won't work). Needs Xcode, CocoaPods, and the phone in Developer Mode.

1. `cp app/.env.example app/.env.local` and fill it in. `EXPO_PUBLIC_API_URL` is your Mac's LAN address (`ipconfig getifaddr en0`), not `localhost`.
2. Run the API against the real Supabase database, reachable from the phone. Real sign-ins create users in Supabase's `auth.users`, which the local database doesn't have:
   ```bash
   set -a; . ./.env; set +a
   DATABASE_URL="$SUPABASE_DB_URL" uv run uvicorn kwamz_api.main:app --host 0.0.0.0 --reload
   ```
3. Plug in the phone and build: `cd app && npx expo run:ios --device`. Later JS changes reload live; rebuild only after native changes (`modules/`, `app.json`, `app.config.ts`, new native packages).

If the phone can't reach the Mac (some campus Wi-Fi blocks device-to-device traffic), put both on a phone hotspot.

Supabase dashboard settings sign-in depends on:
- Apple provider → Client IDs includes the bundle ID `kwamz.radio`.
- Google provider → Client IDs lists the web client ID first, then the iOS client ID; "Skip nonce check" on (the iOS Google SDK adds a nonce Supabase can't see).

## Checks

```bash
uv run pytest                              # Python tests
uv run ruff check . && uv run ruff format --check .
uv run pyright
pnpm test                                  # app tests (Jest)
pnpm lint
pnpm typecheck
```

## API contract

`api/openapi.json` and the typed TS client in `app/src/api/schema.d.ts` are generated, never hand-edited. After changing any endpoint or schema in `api/`, run:

```bash
make contracts
```

and commit the result. CI fails if they're out of date.

## CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`. A `changes` job decides which of `app`, `api`, `pipeline` and `ml` need to run; `contracts` (migrations from scratch + `make contracts` with no diff) always runs. **`CI result`** passes only if every job passed or was skipped: it is the single required check for `main`.

`claude-review.yml` posts advisory review comments when the `ANTHROPIC_API_KEY` secret is set (it is not a required check).
