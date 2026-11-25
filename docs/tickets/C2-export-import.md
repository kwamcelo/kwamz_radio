# C2 — Export parsers, dedupe & web upload page

**Depends on:** C1, H1 (real data for manual check).

## Scope
- Parsers → common row: `(user, artist, title, ts, ms_played, end_reason, skipped, source)`.
  - Spotify extended history JSON (`Streaming_History_Audio_*.json`), ignore podcasts.
  - Apple Play Activity CSV (normalise end reasons, filter non-music).
- Dedupe overlapping Spotify/Apple plays (same song within ±2 min).
- Resolve via C1; write sessions to R2 Parquet (same schema as B1) for training.
- Web upload page served by FastAPI: Supabase login, upload ZIP → R2, background job, status page ("18,432 plays, 87% matched"). Uploads are opt-in (consent text).
- CLI for owner to import directly.

## Done when
- pytest on fixture exports for both formats + dedupe.
- Owner imports own exports; match rate reported in PR.
