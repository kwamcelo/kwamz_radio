# Tickets

Design: [../design.md](../design.md). Every ticket's **Done when** must be covered by automated tests where possible; manual checks are called out explicitly.

| ID | Title | Owner | Depends on | Parallel group |
|---|---|---|---|---|
| H1 | Request listening-history exports | human | — | now |
| H2 | Accounts, keys & portal setup | human | — | now |
| S0-1 | Monorepo scaffold & local dev env | agent | — | slice 0 (sequential) |
| S0-2 | Database schema & migrations | agent | S0-1 | slice 0 |
| S0-3 | API skeleton & OpenAPI contract | agent | S0-2 | slice 0 |
| S0-4 | RadioGenerator interface + dummy generator | agent | S0-3 | slice 0 |
| S0-5 | CI pipeline & branch protection | agent + human | S0-1..S0-4 | slice 0 |
| S0-6 | Walking skeleton app (auth, search, radio, MusicKit playback) | agent + human | S0-3, S0-4, H2 | slice 0 |
| A1 | Feedback buttons & event logging | agent | slice 0 | wave 1 |
| A2 | Radio lifecycle: saved radios, replay, keep going, ban-skip | agent | A1 | wave 1b |
| B1 | ListenBrainz ingestion → sessions Parquet in R2 | agent | slice 0 | wave 1 |
| B2 | item2vec + hand-weighted re-ranker + seed fallbacks | agent | B1, C1 | wave 1b |
| B3 | Walk-forward evaluation harness & CI baseline | agent | B2 | wave 1b |
| C1 | Song resolver: artist/title → MBID → ISRC → Apple ID | agent | slice 0 | wave 1 |
| C2 | Export parsers, dedupe & web upload page | agent | C1, H1 | wave 1b |
| D1 | YouTube fallback provider | agent + human | A1 merged | wave 2 |
| E1 | Consent, privacy page & delete-my-data | agent | A1 | wave 2 |
| F1 | Training pipeline: labels, trained re-ranker, model registry, deploy gate | agent | A1, B3 | wave 3 |
| F2 | Model-version metrics dashboard | agent | F1 | wave 3 |

**Waves:** run at most 2–3 agents at once. Suggested wave 1: A1 + B1 + C1.
