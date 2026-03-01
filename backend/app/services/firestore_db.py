from __future__ import annotations

from typing import Any

from google.cloud import firestore

from app.core.config import settings

_client: firestore.Client | None = None


def _get_client() -> firestore.Client:
    global _client
    if _client is None:
        if not settings.firebase_project_id:
            raise RuntimeError("FIREBASE_PROJECT_ID is required for firestore backend")
        _client = firestore.Client(project=settings.firebase_project_id)
    return _client


def init_metadata_store() -> None:
    # Firestore is schema-less; no file initialization needed.
    _get_client()


def create_model_version(record: dict[str, Any]) -> dict[str, Any]:
    client = _get_client()
    client.collection("model_versions").document(record["id"]).set(record)
    return record


def get_model_version(model_version_id: str) -> dict[str, Any] | None:
    client = _get_client()
    doc = client.collection("model_versions").document(model_version_id).get()
    if not doc.exists:
        return None
    return doc.to_dict()


def update_model_version(model_version_id: str, **updates: Any) -> dict[str, Any] | None:
    client = _get_client()
    ref = client.collection("model_versions").document(model_version_id)
    doc = ref.get()
    if not doc.exists:
        return None
    ref.update(updates)
    updated = ref.get()
    return updated.to_dict() if updated.exists else None


def add_approval(record: dict[str, Any]) -> dict[str, Any]:
    client = _get_client()
    client.collection("approvals").add(record)
    return record
