from __future__ import annotations

import importlib
from pathlib import Path
from typing import Any

from app.core.config import settings
import app.services.local_db as local_db


def _ensure_firestore_env() -> None:
    # По требованию проекта Firestore-режим работает только через backend/.env.
    if not settings.env_file.exists():
        raise RuntimeError("Firestore mode requires backend/.env file")

    if not settings.firebase_project_id:
        raise RuntimeError("FIREBASE_PROJECT_ID is missing in backend/.env")

    if not settings.google_application_credentials:
        raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS is missing in backend/.env")

    cred_path = Path(settings.google_application_credentials)
    if not cred_path.exists():
        raise RuntimeError(f"Credentials file not found: {cred_path}")


def _backend_module():
    if settings.metadata_backend == "firestore":
        _ensure_firestore_env()
        return importlib.import_module("app.services.firestore_db")
    return local_db


def init_metadata_store() -> None:
    _backend_module().init_metadata_store()


def create_model_version(record: dict[str, Any]) -> dict[str, Any]:
    return _backend_module().create_model_version(record)


def get_model_version(model_version_id: str) -> dict[str, Any] | None:
    return _backend_module().get_model_version(model_version_id)


def list_model_versions(
    owner_user_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    return _backend_module().list_model_versions(
        owner_user_id=owner_user_id,
        status=status,
        limit=limit,
    )


def update_model_version(model_version_id: str, **updates: Any) -> dict[str, Any] | None:
    return _backend_module().update_model_version(model_version_id, **updates)


def add_approval(record: dict[str, Any]) -> dict[str, Any]:
    return _backend_module().add_approval(record)
