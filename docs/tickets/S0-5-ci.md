# S0-5 — CI pipeline & branch protection

**Depends on:** S0-1..S0-4. Must be merged **before** any parallel slice starts.

## Scope (GitHub Actions, on every PR)
Path-filtered jobs (e.g. `dorny/paths-filter`):
- **app** (`app/**`): `tsc --noEmit`, ESLint, Jest.
- **api** (`api/**`, `core/**`): Ruff, Pyright, pytest against a Postgres+pgvector service container with migrations applied.
- **pipeline** (`pipeline/**`): Ruff, Pyright, pytest on committed fixture exports (small fake Spotify JSON + Apple CSV).
- **ml** (`ml/**`): Ruff, Pyright, pytest; placeholder step for the mini walk-forward eval (wired up in B3).
- **contracts** (always): migrations apply from scratch; regenerate OpenAPI + TS client and fail on diff.
- **Claude Code review action**: posts an advisory review comment (not a required check).

Owner (human): enable branch protection on `main` — require PRs, require all job checks, block direct pushes.

## Done when
- A PR that edits the schema without regenerating the client fails `contracts`.
- A PR touching only `app/` runs only `app` + `contracts`.
