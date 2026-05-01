from __future__ import annotations

from typing import Any

from google.cloud import firestore

from app.core.config import settings

_client: firestore.Client | None = None
DEFAULT_CATEGORIES = ["Kitchen", "Games", "Tools", "Mechanical", "Electronics", "Decor", "Hobby", "Other"]


def _category_id(label: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in label.strip())
    compact = "-".join(part for part in cleaned.split("-") if part)
    return compact[:64] or "category"


def _get_client() -> firestore.Client:
    global _client
    if _client is None:
        if not settings.firebase_project_id:
            raise RuntimeError("FIREBASE_PROJECT_ID is required for firestore backend")
        _client = firestore.Client(project=settings.firebase_project_id)
    return _client


def init_metadata_store() -> None:
    # Firestore is schema-less, but MVP category defaults make upload dropdown usable.
    client = _get_client()
    if not list(client.collection("categories").limit(1).stream()):
        for index, label in enumerate(DEFAULT_CATEGORIES):
            category_id = _category_id(label)
            client.collection("categories").document(category_id).set(
                {
                    "id": category_id,
                    "label": label,
                    "active": True,
                    "sort_order": index * 10,
                }
            )


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


def list_model_versions(
    owner_user_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    client = _get_client()
    docs = client.collection("model_versions").stream()
    rows = [d.to_dict() for d in docs if d.exists]
    if owner_user_id:
        rows = [r for r in rows if r.get("owner_user_id") == owner_user_id]
    if status:
        rows = [r for r in rows if r.get("status") == status]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    return rows[safe_offset : safe_offset + safe_limit]


def update_model_version(model_version_id: str, **updates: Any) -> dict[str, Any] | None:
    client = _get_client()
    ref = client.collection("model_versions").document(model_version_id)
    doc = ref.get()
    if not doc.exists:
        return None
    ref.update(updates)
    updated = ref.get()
    return updated.to_dict() if updated.exists else None


def delete_model_version(model_version_id: str) -> dict[str, Any] | None:
    client = _get_client()
    ref = client.collection("model_versions").document(model_version_id)
    doc = ref.get()
    if not doc.exists:
        return None
    removed = doc.to_dict()
    ref.delete()

    approvals = client.collection("approvals").where("model_version_id", "==", model_version_id).stream()
    for ap in approvals:
        ap.reference.delete()
    return removed


def add_approval(record: dict[str, Any]) -> dict[str, Any]:
    client = _get_client()
    client.collection("approvals").add(record)
    return record


def save_model_for_user(record: dict[str, Any]) -> dict[str, Any]:
    client = _get_client()
    client.collection("saved_models").document(record["id"]).set(record)
    return record


def unsave_model_for_user(user_id: str, model_version_id: str) -> dict[str, Any] | None:
    client = _get_client()
    ref = client.collection("saved_models").document(f"{user_id}:{model_version_id}")
    doc = ref.get()
    if not doc.exists:
        return None
    removed = doc.to_dict()
    ref.delete()
    return removed


def list_saved_model_ids(user_id: str) -> list[str]:
    client = _get_client()
    docs = client.collection("saved_models").where("user_id", "==", user_id).stream()
    rows = [doc.to_dict() for doc in docs if doc.exists]
    rows.sort(key=lambda row: row.get("saved_at", ""), reverse=True)
    return [str(row.get("model_version_id")) for row in rows if row.get("model_version_id")]


def delete_saved_models_for_model(model_version_id: str) -> int:
    client = _get_client()
    docs = client.collection("saved_models").where("model_version_id", "==", model_version_id).stream()
    removed = 0
    for doc in docs:
        doc.reference.delete()
        removed += 1
    return removed


def delete_saved_models_for_user(user_id: str) -> int:
    client = _get_client()
    docs = client.collection("saved_models").where("user_id", "==", user_id).stream()
    removed = 0
    for doc in docs:
        doc.reference.delete()
        removed += 1
    return removed


def list_model_categories(active_only: bool = True) -> list[dict[str, Any]]:
    client = _get_client()
    docs = client.collection("categories").stream()
    rows = [doc.to_dict() for doc in docs if doc.exists]
    if active_only:
        rows = [row for row in rows if row.get("active", True)]
    rows.sort(key=lambda row: (int(row.get("sort_order") or 100), str(row.get("label") or "")))
    return rows


def create_model_category(label: str) -> dict[str, Any]:
    client = _get_client()
    category_id = _category_id(label)
    ref = client.collection("categories").document(category_id)
    doc = ref.get()
    record = doc.to_dict() if doc.exists else None
    if record:
        record["label"] = label.strip()
        record["active"] = True
    else:
        record = {
            "id": category_id,
            "label": label.strip(),
            "active": True,
            "sort_order": len(list(client.collection("categories").stream())) * 10,
        }
    ref.set(record)
    return record


def delete_model_category(category_id: str) -> dict[str, Any] | None:
    client = _get_client()
    ref = client.collection("categories").document(category_id)
    doc = ref.get()
    if not doc.exists:
        return None
    record = doc.to_dict()
    record["active"] = False
    ref.set(record)
    return record


def update_model_category(
    category_id: str,
    *,
    label: str | None = None,
    sort_order: int | None = None,
) -> dict[str, Any] | None:
    client = _get_client()
    ref = client.collection("categories").document(category_id)
    doc = ref.get()
    if not doc.exists:
        return None
    record = doc.to_dict()
    if label is not None:
        record["label"] = label.strip()
    if sort_order is not None:
        record["sort_order"] = int(sort_order)
    ref.set(record)
    return record
