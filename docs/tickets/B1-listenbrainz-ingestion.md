# B1 — ListenBrainz ingestion

**Depends on:** slice 0.

## Scope
- Script to download a ListenBrainz full/incremental dump, stream-filter locally: keep listens with recording MBIDs within a configurable date window.
- Sessionise per user (gap > 30 min = new session); drop sessions < 3 tracks.
- Output partitioned Parquet (`user_hash, session_id, ts, recording_mbid, artist_mbid`) → upload to R2; delete raw dump.
- Also ingest ListenBrainz similar-artist data (for B2 fallback) and MusicBrainz artist tags into `artists`.
- Report: listens kept, users, sessions, unique recordings.

## Done when
- pytest on a tiny fixture dump: correct filtering + sessionisation.
- Owner runs it once on a real dump; size of output recorded in the PR.
