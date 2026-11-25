# F2 — Model-version metrics dashboard

**Depends on:** F1.

## Scope
- Per `model_version` and `seed_strategy`: early-skip rate (primary), completion rate, ❤️/➕ per radio, keep-going rate, replays. Split by provider.
- Simple web page (FastAPI route, owner-only) or SQL views + a notebook.

## Done when
- SQL views tested against fixture events; dashboard renders for owner.
