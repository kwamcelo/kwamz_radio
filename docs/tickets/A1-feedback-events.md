# A1 — Feedback buttons & event logging

**Depends on:** slice 0.

## Scope
- ❤️ (like/unlike, in-app), 🚫 ban, ➕ Add to Apple Music (`POST /v1/me/library`, Apple users only).
- ➕ first-use modal: "Songs added to your Apple Music library can't be removed from this app — remove them in the Music app." + "Don't show again" (persisted per user).
- After ➕: show "Added to Apple Music" state.
- Event logger in the app: `play_start`, `progress` (~10s), `pause`, `seek`, `skip`, `complete`, `like`, `unlike`, `add_to_library`, `ban`, `start_radio_from`. Each with radio_id, radio_position, provider, position_ms, client_ts.
- Local queue + batched `POST /events`, survives offline / app kill.
- Long-press track → "Start radio from this" (logs `start_radio_from`).

## Done when
- Jest: logger batches, retries, persists across restart; modal shows once.
- pytest: events + likes/bans persisted; RLS respected.
- Manual: play a radio, skip/like/ban, verify rows in Supabase.
