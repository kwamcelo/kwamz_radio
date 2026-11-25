# B3 — Walk-forward evaluation harness

**Depends on:** B2.

## Scope
- `ml eval` command: for cutoffs T₁..Tₖ (monthly), train on data < T, seeds = post-T manual choices (`reason_start = clickrow` / in-app seeds), generate 20, score against the user's plays in the next N weeks that weren't early-skipped (<30s).
- Metrics: Hit Rate@20, NDCG@20, unique artists/radio, catalog coverage. Baseline: "popular songs by seed's artist".
- Run on owner's history + a sample of ListenBrainz users.
- **CI gate:** mini eval on a small committed fixture dataset; fail if Hit Rate@20 < stored baseline (`ml/baseline.json`) or diversity drops.

## Done when
- Eval report (markdown) generated; model beats the artist baseline on real data (owner verifies).
- CI `ml` job runs the mini eval.
