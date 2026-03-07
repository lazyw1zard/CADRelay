from __future__ import annotations

from hashlib import sha256
from pathlib import Path

from google.cloud import storage

from app.core.config import settings

_client: storage.Client | None = None


def _safe_filename(name: str) -> str:
    return "".join(ch for ch in name if ch.isalnum() or ch in {"-", "_", "."}) or "upload.step"


def _get_client() -> storage.Client:
    global _client
    if _client is None:
        if not settings.firebase_project_id:
            raise RuntimeError("FIREBASE_PROJECT_ID is required for firebase storage backend")
        _client = storage.Client(project=settings.firebase_project_id)
    return _client


def _get_bucket() -> storage.Bucket:
    if not settings.firebase_storage_bucket:
        raise RuntimeError("FIREBASE_STORAGE_BUCKET is required for firebase storage backend")
    return _get_client().bucket(settings.firebase_storage_bucket)


def save_original_bytes(model_version_id: str, filename: str, payload: bytes) -> tuple[str, str, int]:
    # Загружаем исходный CAD-файл в Firebase Storage bucket.
    safe_name = _safe_filename(filename)
    rel_key = f"originals/{model_version_id}_{safe_name}"
    blob = _get_bucket().blob(rel_key)
    blob.upload_from_string(payload, content_type="application/octet-stream")
    checksum = sha256(payload).hexdigest()
    return rel_key, checksum, len(payload)


def save_glb_bytes(model_version_id: str, payload: bytes) -> str:
    # Загружаем производный GLB-артефакт в bucket.
    rel_key = f"glb/{model_version_id}.glb"
    blob = _get_bucket().blob(rel_key)
    blob.upload_from_string(payload, content_type="model/gltf-binary")
    return rel_key


def resolve_storage_path(storage_key: str) -> Path:
    # Для облачного backend нет локального пути; возвращаем key как псевдо-путь.
    return Path(storage_key)
