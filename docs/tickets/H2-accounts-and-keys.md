# H2 — Accounts, keys & portal setup (human)

Agents cannot do these. Store all secrets in a password manager + `.env` (git-ignored) and GitHub Actions secrets as needed.

- [ ] Apple Developer: create App ID with **MusicKit** capability; create a **MusicKit private key** (.p8), note Key ID + Team ID (used to sign developer tokens).
- [ ] Apple Developer: enable **Sign in with Apple**; create a Services ID for the Supabase/Android web flow.
- [ ] Supabase: create project; enable pgvector; configure Apple + Google auth providers.
- [ ] Google Cloud: OAuth client for Google sign-in; **YouTube Data API v3** key (needed by D1).
- [ ] Cloudflare: R2 bucket + API token (S3-compatible credentials).
- [ ] GitHub: create private repo `kwam_radio`; add an Anthropic API key secret if using the Claude review action (S0-5).
- [ ] Railway or Fly.io account for the API.
