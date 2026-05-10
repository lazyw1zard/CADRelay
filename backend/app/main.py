from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes import router as api_router
from app.core.config import settings
from app.services.metadata_store import init_metadata_store
from app.services.postgres_auth import init_auth_store

app = FastAPI(title="MakeLayer API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Подключаем все API-роуты под единым префиксом /api/v1.
app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
def startup() -> None:
    # При старте подготавливаем локальное хранилище метаданных.
    init_metadata_store()
    if settings.auth_mode == "postgres":
        init_auth_store()


@app.get("/health")
def health() -> dict[str, str]:
    # Простой endpoint для проверки, что сервис жив.
    return {"status": "ok"}
