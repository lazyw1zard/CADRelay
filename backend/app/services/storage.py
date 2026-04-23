from __future__ import annotations

from hashlib import sha256
from pathlib import Path

from app.core.config import settings


def _safe_filename(name: str) -> str:
    # Убираем потенциально опасные символы из имени файла.
    return "".join(ch for ch in name if ch.isalnum() or ch in {"-", "_", "."}) or "upload.step"


def save_original_bytes(model_version_id: str, filename: str, payload: bytes) -> tuple[str, str, int]:
    # Сохраняем исходный CAD-файл и возвращаем его ключ + контрольную сумму + размер.
    safe_name = _safe_filename(filename)
    rel_key = f"originals/{model_version_id}_{safe_name}"
    abs_path = settings.storage_dir / rel_key
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(payload)
    checksum = sha256(payload).hexdigest()
    return rel_key, checksum, len(payload)


def save_glb_bytes(model_version_id: str, payload: bytes) -> str:
    # Сохраняем производный GLB-артефакт.
    rel_key = f"glb/{model_version_id}.glb"
    abs_path = settings.storage_dir / rel_key
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(payload)
    return rel_key


def save_thumbnail_bytes(
    model_version_id: str,
    filename: str,
    payload: bytes,
    content_type: str | None = None,
) -> str:
    # Сохраняем пользовательскую миниатюру (png/jpg/webp).
    safe_name = _safe_filename(filename or "thumbnail.png").lower()
    ext = Path(safe_name).suffix
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        if content_type == "image/jpeg":
            ext = ".jpg"
        elif content_type == "image/webp":
            ext = ".webp"
        else:
            ext = ".png"
    rel_key = f"thumbnails/{model_version_id}{ext}"
    abs_path = settings.storage_dir / rel_key
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(payload)
    return rel_key


def load_bytes(storage_key: str) -> bytes:
    abs_path = settings.storage_dir / storage_key
    if not abs_path.exists():
        raise FileNotFoundError(storage_key)
    return abs_path.read_bytes()


def delete_bytes(storage_key: str) -> None:
    abs_path = settings.storage_dir / storage_key
    if abs_path.exists():
        abs_path.unlink()


def resolve_storage_path(storage_key: str) -> Path:
    # Переводим storage_key в физический путь на диске.
    return settings.storage_dir / storage_key
