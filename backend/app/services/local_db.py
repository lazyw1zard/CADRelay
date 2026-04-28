from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.config import settings


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
