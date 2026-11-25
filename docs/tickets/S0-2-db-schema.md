# S0-2 — Database schema & migrations

**Depends on:** S0-1. **This is a contract — later changes need owner approval.**

## Tables (Supabase migrations)
- `users` — id (uuid, = Supabase auth uid), pseudonymous `training_id` (uuid), provider_preference (`auto|apple|youtube`), consent_at, deleted_at, created_at.
- `songs` — id, mbid (nullable, unique), isrc, apple_id, youtube_video_id, youtube_match_flagged, title, artist, artist_mbid, duration_ms, genres (text[]), embedding (vector, nullable), updated_at.
- `artists` — mbid, name, mb_tags (text[]), apple_genres (text[]).
- `radios` — id, user_id, seed_song_id, parent_radio_id (for "keep going"), model_version, seed_strategy (`direct|fallback_artist|fallback_similar_artist|fallback_genre`), created_at.
- `radio_tracks` — radio_id, position (0–19), song_id. Immutable after insert.
- `events` — id, user_id, song_id, radio_id (nullable), type (enum per design.md), provider (`apple|youtube`), position_ms, radio_position, client_ts, server_ts, payload (jsonb).
- `likes`, `bans` — current state per (user, song) for fast lookup.
- `imports` — id, user_id, source (`spotify|apple`), status, total_rows, matched_rows, r2_key, created_at.
- `model_versions` — id, kind (`item2vec|reranker`), created_at, metrics (jsonb), is_active.

RLS: users can only read/write their own rows. Service role for the API/pipeline.

## Done when
- Migrations apply cleanly to an empty DB (local + CI).
- A test inserts a radio with 20 tracks and asserts `radio_tracks` cannot be updated.
- RLS test: user A cannot read user B's events.
