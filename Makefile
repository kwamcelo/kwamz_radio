.PHONY: contracts

# Regenerate the API contract artifacts. CI fails if this leaves a diff.
contracts:
	uv run python api/scripts/export_openapi.py
	pnpm --filter @kwamz-radio/app exec openapi-typescript ../api/openapi.json -o src/api/schema.d.ts
