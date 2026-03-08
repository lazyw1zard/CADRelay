from __future__ import annotations

import importlib
from pathlib import Path

from app.core.config import settings
import app.services.storage as local_storage


def _ensure_firebase_storage_env() -> None:
    # По требованию проекта Firebase Storage режим работает через backend/.env.
    if not settings.env_file.exists():
        raise RuntimeError("Firebase storage mode requires backend/.env file")

    if not settings.firebase_project_id:
        raise RuntimeError("FIREBASE_PROJECT_ID is missing in backend/.env")

    if not settings.google_application_credentials:
        raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS is missing in backend/.env")

    cred_path = Path(settings.google_application_credentials)
    if not cred_path.exists():
        raise RuntimeError(f"Credentials file not found: {cred_path}")

    if not settings.firebase_storage_bucket:
        raise RuntimeError("FIREBASE_STORAGE_BUCKET is missing in backend/.env")


def _backend_module():
    if settings.storage_backend == "firebase":
        _ensure_firebase_storage_env()
        return importlib.import_module("app.services.firebase_storage")
    return local_storage


def save_original_bytes(model_version_id: str, filename: str, payload: bytes) -> tuple[str, str, int]:
    return _backend_module().save_original_bytes(model_version_id, filename, payload)


def save_glb_bytes(model_version_id: str, payload: bytes) -> str:
    return _backend_module().save_glb_bytes(model_version_id, payload)


def load_bytes(storage_key: str) -> bytes:
    return _backend_module().load_bytes(storage_key)


def delete_bytes(storage_key: str) -> None:
    return _backend_module().delete_bytes(storage_key)
