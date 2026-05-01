from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import settings

DEFAULT_CATEGORIES = ["Kitchen", "Games", "Tools", "Mechanical", "Electronics", "Decor", "Hobby", "Other"]


def _category_id(label: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in label.strip())
    compact = "-".join(part for part in cleaned.split("-") if part)
    return compact[:64] or "category"


def _default_categories() -> dict[str, dict[str, Any]]:
    return {
        _category_id(label): {
            "id": _category_id(label),
            "label": label,
            "active": True,
            "sort_order": index * 10,
        }
        for index, label in enumerate(DEFAULT_CATEGORIES)
    }


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    # Если файла еще нет, возвращаем структуру по умолчанию.
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _write_json(path: Path, value: dict[str, Any]) -> None:
    # Любое обновление полностью записываем обратно в json-файл.
    _ensure_parent(path)
    with path.open("w", encoding="utf-8") as fp:
        json.dump(value, fp, ensure_ascii=True, indent=2)


def init_metadata_store() -> None:
    # Инициализируем обязательные разделы локальной "базы".
    data = _load_json(settings.metadata_file, default={})
    data.setdefault("model_versions", {})
    data.setdefault("approvals", [])
    data.setdefault("saved_models", {})
    if "categories" not in data:
        data["categories"] = _default_categories()
    _write_json(settings.metadata_file, data)


def create_model_version(record: dict[str, Any]) -> dict[str, Any]:
    # Добавляем/перезаписываем карточку версии по ее id.
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": []})
    data["model_versions"][record["id"]] = record
    _write_json(settings.metadata_file, data)
    return record


def get_model_version(model_version_id: str) -> dict[str, Any] | None:
    # Читаем одну версию модели по id.
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": []})
    return data["model_versions"].get(model_version_id)


def list_model_versions(
    owner_user_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": []})
    rows = list(data["model_versions"].values())
    if owner_user_id:
        rows = [r for r in rows if r.get("owner_user_id") == owner_user_id]
    if status:
        rows = [r for r in rows if r.get("status") == status]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    return rows[safe_offset : safe_offset + safe_limit]


def update_model_version(model_version_id: str, **updates: Any) -> dict[str, Any] | None:
    # Обновляем только переданные поля (например статус).
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": []})
    current = data["model_versions"].get(model_version_id)
    if current is None:
        return None
    current.update(updates)
    data["model_versions"][model_version_id] = current
    _write_json(settings.metadata_file, data)
    return current


def delete_model_version(model_version_id: str) -> dict[str, Any] | None:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": []})
    removed = data["model_versions"].pop(model_version_id, None)
    if removed is None:
        return None
    data["approvals"] = [a for a in data["approvals"] if a.get("model_version_id") != model_version_id]
    _write_json(settings.metadata_file, data)
    return removed


def add_approval(record: dict[str, Any]) -> dict[str, Any]:
    # Добавляем запись о решении клиента в журнал approvals.
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}})
    data["approvals"].append(record)
    _write_json(settings.metadata_file, data)
    return record


def save_model_for_user(record: dict[str, Any]) -> dict[str, Any]:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}})
    data.setdefault("saved_models", {})
    data["saved_models"][record["id"]] = record
    _write_json(settings.metadata_file, data)
    return record


def unsave_model_for_user(user_id: str, model_version_id: str) -> dict[str, Any] | None:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}})
    data.setdefault("saved_models", {})
    removed = data["saved_models"].pop(f"{user_id}:{model_version_id}", None)
    _write_json(settings.metadata_file, data)
    return removed


def list_saved_model_ids(user_id: str) -> list[str]:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}})
    saved = list(data.get("saved_models", {}).values())
    rows = [row for row in saved if row.get("user_id") == user_id]
    rows.sort(key=lambda row: row.get("saved_at", ""), reverse=True)
    return [str(row.get("model_version_id")) for row in rows if row.get("model_version_id")]


def delete_saved_models_for_model(model_version_id: str) -> int:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}})
    saved = data.setdefault("saved_models", {})
    before = len(saved)
    data["saved_models"] = {
        key: row for key, row in saved.items() if row.get("model_version_id") != model_version_id
    }
    _write_json(settings.metadata_file, data)
    return before - len(data["saved_models"])


def delete_saved_models_for_user(user_id: str) -> int:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}})
    saved = data.setdefault("saved_models", {})
    before = len(saved)
    data["saved_models"] = {key: row for key, row in saved.items() if row.get("user_id") != user_id}
    _write_json(settings.metadata_file, data)
    return before - len(data["saved_models"])


def list_model_categories(active_only: bool = True) -> list[dict[str, Any]]:
    data = _load_json(settings.metadata_file, default={"categories": _default_categories()})
    categories = list(data.get("categories", {}).values())
    if active_only:
        categories = [row for row in categories if row.get("active", True)]
    categories.sort(key=lambda row: (int(row.get("sort_order") or 100), str(row.get("label") or "")))
    return categories


def create_model_category(label: str) -> dict[str, Any]:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}, "categories": {}})
    data.setdefault("categories", {})
    category_id = _category_id(label)
    existing = data["categories"].get(category_id)
    if existing:
        existing["label"] = label.strip()
        existing["active"] = True
        data["categories"][category_id] = existing
    else:
        data["categories"][category_id] = {
            "id": category_id,
            "label": label.strip(),
            "active": True,
            "sort_order": len(data["categories"]) * 10,
        }
    _write_json(settings.metadata_file, data)
    return data["categories"][category_id]


def delete_model_category(category_id: str) -> dict[str, Any] | None:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}, "categories": {}})
    data.setdefault("categories", {})
    current = data["categories"].get(category_id)
    if current is None:
        return None
    current["active"] = False
    data["categories"][category_id] = current
    _write_json(settings.metadata_file, data)
    return current


def update_model_category(
    category_id: str,
    *,
    label: str | None = None,
    sort_order: int | None = None,
) -> dict[str, Any] | None:
    data = _load_json(settings.metadata_file, default={"model_versions": {}, "approvals": [], "saved_models": {}, "categories": {}})
    data.setdefault("categories", {})
    current = data["categories"].get(category_id)
    if current is None:
        return None
    if label is not None:
        current["label"] = label.strip()
    if sort_order is not None:
        current["sort_order"] = int(sort_order)
    data["categories"][category_id] = current
    _write_json(settings.metadata_file, data)
    return current
