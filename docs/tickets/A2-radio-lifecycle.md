# A2 — Radio lifecycle

**Depends on:** A1.

## Scope
- "My radios" list; replay a saved radio unchanged.
- "Keep going" at end → `POST /radios` with `parent_radio_id` → next 20 using latest model.
- Playback skips banned songs without altering `radio_tracks`.

## Done when
- pytest: continuation links to parent and excludes songs already in the chain.
- Jest: banned tracks skipped in queue; replay shows original order.
