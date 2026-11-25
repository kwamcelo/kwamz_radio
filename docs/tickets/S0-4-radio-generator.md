# S0-4 — RadioGenerator interface + dummy generator

**Depends on:** S0-3. **Contract — changes need owner approval.**

## Scope
```python
class RadioGenerator(Protocol):
    version: str
    def generate(self, user_id: UUID, seed: Song, n: int = 20,
                 exclude: set[SongId] = ...) -> RadioResult: ...
# RadioResult: tracks: list[SongId], seed_strategy: str, model_version: str
```
- `DummyGenerator`: 20 songs by the seed's artist from the Apple catalog (excluding the seed and banned songs).
- Generator selection via config so B2 can swap in `Item2VecGenerator` without touching the API.

## Done when
- Unit tests: returns exactly n unique songs, excludes seed and bans, sets `seed_strategy` and `model_version`.
- A shared test suite (`test_generator_contract.py`) any generator implementation can be run against.
