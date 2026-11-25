# F1 — Training pipeline, trained re-ranker & deploy gate

**Depends on:** A1, B3.

## Scope
- Label derivation from raw events (configurable): add_to_library > like > complete/replay > late skip (neutral) > early skip < ban. `unavailable` excluded. Provider recorded as a feature.
- Trained re-ranker (LightGBM) with features: seed similarity, user–artist affinity, popularity, provider, position, etc. Only enabled once events exceed a configured threshold; otherwise hand-weighted re-ranker stays.
- Schedules (owner's machine, cron/launchd): re-ranker nightly, item2vec weekly; exclude deleted users.
- Model registry in `model_versions` + R2 artifacts; deploy gate = B3 walk-forward must beat active model on Hit Rate@20 without diversity regression; rollback command.

## Done when
- pytest: label derivation table-tested; gate rejects a worse model.
- One full nightly run on real data recorded in the PR.
