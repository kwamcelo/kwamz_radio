# C1 — Song resolver

**Depends on:** slice 0. Shared module — used by C2, B2, D1.

## Scope
- `resolve(artist, title, duration_ms?) -> Song`:
  1. ListenBrainz metadata lookup → recording MBID (+ artist MBID).
  2. MusicBrainz → ISRC(s).
  3. Apple catalog lookup by ISRC → apple_id.
  4. Fallback: Apple search by artist + title, pick by duration tolerance (±3s) → apple_id-only song.
- Upsert into `songs`; cache all lookups; respect MusicBrainz rate limit (1 req/s) and set a generic User-Agent (no personal details).
- **No Spotify API calls.**
- Unmatched results recorded with reason.

## Done when
- pytest with recorded HTTP fixtures (e.g. respx/vcrpy): happy path, no ISRC, ambiguous Apple match, total miss.
- Match-rate report function used by C2.
