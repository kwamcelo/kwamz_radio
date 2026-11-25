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

## Checks

```bash
uv run pytest                              # Python tests
uv run ruff check . && uv run ruff format --check .
uv run pyright
pnpm test                                  # app tests (Jest)
pnpm lint
pnpm typecheck
```
