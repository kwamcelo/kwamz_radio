# S0-1 — Monorepo scaffold & local dev env

**Depends on:** —

## Scope
- Layout: `app/` (Expo + TypeScript), `api/` (FastAPI), `ml/`, `pipeline/`, `supabase/` (migrations), `docs/`.
- Python: one `uv` workspace covering `api`, `ml`, `pipeline`; shared package `core/` for the `songs` model + DB access if useful. Ruff + Pyright configured.
- JS: pnpm; Expo app created with TypeScript, ESLint, Jest.
- `docker-compose.yml`: Postgres 16 + pgvector for local dev and tests.
- `.env.example` listing every secret from H2; `.gitignore` covers `.env`, data files, exports.
- Root `README.md`: how to run each part locally.

## Done when
- `docker compose up` gives a working pgvector DB.
- `uv run pytest` and `pnpm test` both run (trivially passing) from a clean clone.
