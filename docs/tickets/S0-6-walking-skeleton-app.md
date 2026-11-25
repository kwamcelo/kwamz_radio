# S0-6 — Walking skeleton app

**Depends on:** S0-3, S0-4, H2.

## Scope
- Expo app (dev build, not Expo Go — MusicKit needs native code).
- Sign in with Apple + Google via Supabase.
- Search screen → tap song → `POST /radios` → radio screen with 20 tracks.
- **Apple MusicKit playback** via a native module (Expo config plugin): request authorisation on first play, play queue, background audio, lock-screen controls.
- `Player` interface in the app (`play`, `pause`, `seek`, `next`, events) so D1 can add a YouTube implementation.

## Done when
- Jest tests for screens with mocked API + mocked Player.
- **Manual (owner, real iPhone):** search → radio → plays → keeps playing with screen locked 10 min → lock-screen next works.
