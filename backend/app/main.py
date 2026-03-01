from fastapi import FastAPI

from app.api.v1.routes import router as api_router
from app.services.local_db import init_metadata_store

app = FastAPI(title="CADRelay API", version="0.1.0")
# Подключаем все API-роуты под единым префиксом /api/v1.
app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
def startup() -> None:
    # При старте подготавливаем локальное хранилище метаданных.
    init_metadata_store()


@app.get("/health")
def health() -> dict[str, str]:
    # Простой endpoint для проверки, что сервис жив.
    return {"status": "ok"}
