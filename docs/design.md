# kwam_radio — Design

A mobile app that generates Spotify-radio-style playlists from a single seed song, using a recommendation model trained on public listening data, the owner's own listening history, and in-app listening behaviour.

## Scope

- **Phase (a), now:** portfolio/learning project for the owner + 5–30 friends.
- **Phase (b), later:** public app. Every decision below must keep that path open.

## Architecture overview

```
 Expo app (iOS + Android)                    Web upload page
   │  search, radios, playback, events          │  export ZIPs
   ▼                                            ▼
 FastAPI (Python, Docker) ─────────────── Supabase (Postgres + pgvector + Auth)
   │  RadioGenerator interface                   ▲
   ▼                                            │
 Models (item2vec + re-ranker)  ◄── training scripts (owner's machine, scheduled)
                                                │
                                   Cloudflare R2 (processed Parquet, uploaded exports)
```

Monorepo: `app/` (Expo), `api/` (FastAPI), `ml/` (training + eval), `pipeline/` (data import + matching), `supabase/` (migrations), `docs/`.

## Playback

- **Apple MusicKit** for Apple Music subscribers (native, background playback, lock screen).
- **YouTube IFrame player** (via WebView) for everyone else. Video stays visible (min 200×200), foreground only, per YouTube ToS.
- **Provider detection:** check MusicKit subscription capability at first playback and on every launch; manual override in settings.
- YouTube video matches are cached per song (ISRC/MBID → video ID); users can flag a wrong match. YouTube Data API quota ≈ 100 searches/day, so caching is mandatory.
- If a song has no match on the user's provider → skip it and log `unavailable`. **`unavailable` is never a negative signal.**
- **No Spotify API anywhere.** Spotify's Developer Terms prohibit using Spotify content to train ML models.

## Radios

- Seed: **exactly one song**, chosen via Apple Music catalog search (developer token; works for all users) or "Start radio from this" on any track.
- Generated once as a **frozen list of 20 songs**, saved, replayable, tagged with `model_version` and `seed_strategy` (`direct` / `fallback_artist` / `fallback_similar_artist` / `fallback_genre`).
- "Keep going" generates a **new continuation of 20** with the latest model; existing tracks never change.
- Banned songs are skipped at playback time (the list itself is not modified).

## Buttons & signals

- ❤️ **Like:** in-app only, reversible. Strong positive.
- ➕ **Add to Apple Music:** Apple Music users only. Adds to the real library. First use shows a one-time warning ("can't be removed from this app — remove it in the Music app") with "Don't show again". Strongest positive.
- 🚫 **Ban:** in-app only. Strong negative.
- **Raw events are logged; labels are derived at training time.** Event types: `play_start`, `progress` (~10s), `pause`, `seek`, `skip`, `complete`, `like`, `unlike`, `add_to_library`, `ban`, `start_radio_from`, `unavailable`. Each carries: user, song, radio_id, seed song, position in radio, provider, client timestamp, playback position.

## Data

| Source | Notes |
|---|---|
| ListenBrainz dumps | CC0. Downloaded, filtered locally (MBID-linked listens, recent years, sessionised), stored as Parquet in R2; raw dumps deleted. |
| Owner's Spotify extended streaming history | Personal data; parsed from JSON. Rich `reason_start/end`, `skipped`. No context/playlist field. |
| Owner's Apple privacy export | Play Activity CSV; messier. Deduped against Spotify for overlapping periods. |
| Friends' exports | Uploaded via a web page (ZIP), processed in the background, status shown ("18,432 plays, 87% matched"). |

**Canonical ID = MusicBrainz recording MBID.** Matching: artist + title → MBID (ListenBrainz metadata lookup) → ISRC (MusicBrainz) → Apple catalog ID. Fallback: Apple text search on artist + title + duration → Apple-ID-only song (joins the model once a later retrain resolves it). All mappings live in one `songs` table. Unmatched rows are logged; every import produces a match-rate report.

## Model

**Two stages**, behind a `RadioGenerator` interface:

1. **Candidates — item2vec** trained on listening sessions (ListenBrainz + exports + in-app). ~500 nearest neighbours of the seed (pgvector).
2. **Re-ranker** — starts **hand-weighted** (seed similarity + user's like/ban history + artist spacing); replaced by a trained model (e.g. LightGBM) once in-app events reach a few thousand.

**Unknown seed fallback chain:** same artist (mean of known songs) → similar artists (ListenBrainz / Apple similar-artist data) → MusicBrainz sub-genre (Apple `genreNames` as backup), seeding with known songs sharing the most tags — not genre charts.

**Retraining: batch only.** Re-ranker nightly, item2vec weekly. No in-session adaptation (radios are frozen). Every model version is kept for rollback/comparison.

## Evaluation

- **Offline gate (walk-forward):** pick cutoff T, train on data before T, use post-T manual song choices (`reason_start = clickrow` or in-app seeds) as seeds, generate 20 songs, score against what the user actually played *and didn't early-skip* in the following weeks. Roll T forward. Metrics: Hit Rate@20, NDCG@20, diversity (unique artists/radio), catalog coverage. Baseline: "popular songs by the seed's artist". A new model ships only if Hit Rate@20 improves and diversity does not regress.
- **Online (per model_version):** early-skip rate (<30s) — **primary**; completion rate; ❤️/➕ per radio; "Keep going" rate; radio replays.
- No A/B tests until phase (b).

## Backend & infra

- **FastAPI** (Python), Dockerised, hosted on Railway or Fly.io.
- **Supabase**: Postgres + pgvector + Auth (Sign in with Apple, Google). FastAPI verifies Supabase JWTs.
- Apple Music authorisation requested on first Apple Music playback, not at sign-up.
- **Cloudflare R2** (S3-compatible, `boto3`) for processed data and uploaded exports.
- Training runs on the owner's machine on a schedule. Move to AWS only in phase (b).

## Privacy

- Consent at sign-up: in-app listening is used to train the model. Plain-language privacy page.
- Export upload is separate and optional.
- **Delete my data:** removes events, radios, uploads; user is excluded from all future training runs (existing models retain traces until the next retrain — stated in the policy).
- Training data uses pseudonymous user IDs. No raw data shared outside the app.
- Relevant law: PIPEDA / BC PIPA; GDPR if EU users appear in phase (b).

## Development process

- **Vertical slices.** Slice 0 is sequential (contracts + walking skeleton + CI). Then parallel slices, **2–3 agents at a time**, each in its own git worktree.
- **CI on every PR** (GitHub Actions, path-filtered): app (tsc, ESLint, Jest), api (Ruff, Pyright, pytest vs Postgres+pgvector container), pipeline (pytest on fixture exports), ml (pytest + mini walk-forward eval vs stored baseline), contracts (migrations apply from scratch; generated OpenAPI matches committed spec; generated TS client up to date). Branch protection on `main`. Claude Code review action posts review comments (advisory).
- **Owner-only responsibilities:** Apple Developer portal, real-device testing (MusicKit, background audio), approving any schema/API contract change, merging.

## Decision log

| # | Decision | Why |
|---|---|---|
| 1 | Friends-scale first, public later | Licensing and infra are far easier at small scale |
| 2 | MusicKit primary, YouTube fallback, no Spotify | Owner has Apple dev account; Spotify bans ML training on its content |
| 3 | React Native (Expo) | Phone-first; native background playback for Apple Music; owner wants to learn RN |
| 4 | ListenBrainz + own + friends' exports | CC0 license keeps phase (b) open; Last.fm / Spotify MPD are non-commercial |
| 5 | Raw events, labels at train time | Can reinterpret signals later without data loss |
| 6 | ❤️ in-app + ➕ library with one-time warning | Clear semantics; Apple API cannot remove library items |
| 7 | Two-stage model | Industry-standard; stages built/evaluated independently; room to add ALS or sequential models later |
| 8 | Batch retraining, frozen radios | Reproducible radios; clean per-version comparison |
| 9 | 20-song radios, single-song seeds | Simple v1 |
| 10 | Fallback: artist → similar artist → MB sub-genre | Avoids refusing; MB tags are fine-grained |
| 11 | FastAPI + Supabase + R2, no AWS yet | One language for API+ML, minimal ops, cheap; Docker keeps AWS migration easy |
| 12 | Walk-forward evaluation vs real future listening | Never leaks the future; doesn't train toward imitating Spotify |
| 13 | MBID canonical ID, no Spotify API for matching | Joins own data with ListenBrainz in item2vec; avoids ToS grey area |
| 14 | Web upload for exports | ZIPs are painful on iPhone |
| 15 | Slice 0 includes CI before parallel agents | First PRs are the most likely to break contracts; reduces review load |
