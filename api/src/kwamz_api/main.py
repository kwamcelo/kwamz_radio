from fastapi import FastAPI

app = FastAPI(title="kwamz_radio API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
