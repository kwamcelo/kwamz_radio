"""Write the API's OpenAPI spec to api/openapi.json (run via `make contracts`)."""

import json
from pathlib import Path

from kwamz_api.main import app

OUT = Path(__file__).resolve().parents[1] / "openapi.json"


def main() -> None:
    OUT.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
