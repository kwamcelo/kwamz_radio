# E1 — Consent, privacy page & delete-my-data

**Depends on:** A1.

## Scope
- Consent screen at sign-up ("Your listening in this app is used to train the recommendation model"); store `consent_at`; no event logging without it.
- Plain-language privacy page (in-app + web).
- "Delete my data": removes events, likes, bans, radios, imports (+ R2 objects); sets `deleted_at`; training data exports exclude deleted users. Policy notes models retain traces until next retrain.
- Training exports use `training_id`, never email/name.

## Done when
- pytest: delete cascades, R2 objects removed (mocked), next training export excludes the user.
- Jest: no events sent before consent.
