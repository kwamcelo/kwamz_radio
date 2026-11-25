# B2 — item2vec + hand-weighted re-ranker + seed fallbacks

**Depends on:** B1, C1 (for MBID → playable Apple ID).

## Scope
- Train item2vec (gensim Word2Vec, skip-gram) on sessions (ListenBrainz + any imported exports). Min-count threshold configurable.
- Write embeddings to `songs.embedding` (pgvector) for MBIDs that exist in `songs`; register in `model_versions`.
- `Item2VecGenerator` implementing `RadioGenerator`:
  1. Candidates: ~500 nearest neighbours of seed (pgvector), excluding bans and unplayable songs.
  2. Hand-weighted re-ranker: seed similarity + user like/ban affinity (artist-level) + artist spacing (no artist twice within 3 slots).
  3. Fallbacks when seed has no embedding: same artist → similar artists → MB sub-genre (Apple `genreNames` backup), seeding with known songs sharing most tags. Sets `seed_strategy`.
- Must pass the shared `test_generator_contract.py`.

## Done when
- pytest on a synthetic dataset: neighbours of a song cluster as expected; each fallback branch exercised.
- Generator switchable by config; dummy remains available.
