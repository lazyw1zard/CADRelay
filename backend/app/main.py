from fastapi import FastAPI

from app.api.v1.routes import router as api_router

app = FastAPI(title="CADRelay API", version="0.1.0")
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
