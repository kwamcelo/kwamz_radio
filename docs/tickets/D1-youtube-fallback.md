# D1 — YouTube fallback provider

**Depends on:** A1 merged (shares Player + events code).

## Scope
- Provider detection: MusicKit subscription capability check on first play + every launch; respect `provider_preference` override.
- `YouTubePlayer` implementing the app `Player` interface (react-native-youtube-iframe / WebView), video visible ≥200×200, foreground only.
- Backend video matching: YouTube Data API search (artist + title + "audio"), pick by duration; cache in `songs.youtube_video_id`; daily quota guard.
- "Wrong video?" report → `youtube_match_flagged`, re-match on next request.
- No match → skip + log `unavailable` (never counted as negative in F1).

## Done when
- Jest: provider selection logic incl. lapsed subscription; unavailable path.
- pytest: matching + cache + quota guard.
- Manual (owner): Android or non-subscriber account plays a full radio via YouTube.
