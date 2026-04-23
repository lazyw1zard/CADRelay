from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile
import io

THUMBNAIL_REL_TYPE = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass(slots=True)
class ExtractedThumbnail:
    # Единый формат результата извлечения миниатюры из 3MF.
    payload: bytes
    filename: str
    content_type: str


def _normalize_zip_name(name: str) -> str:
    normalized = name.replace("\\", "/").strip()
    normalized = normalized.lstrip("/").removeprefix("./")
    return normalized


def _safe_thumbnail_filename(name: str, fallback_ext: str) -> str:
    base = Path(name).name or f"thumbnail{fallback_ext}"
    safe = "".join(ch for ch in base if ch.isalnum() or ch in {"-", "_", "."}).strip(".")
    if not safe:
        return f"thumbnail{fallback_ext}"
    ext = Path(safe).suffix.lower()
    if ext not in SUPPORTED_IMAGE_EXTENSIONS:
        stem = Path(safe).stem or "thumbnail"
        return f"{stem}{fallback_ext}"
    return safe


def _detect_content_type(payload: bytes) -> tuple[str, str] | None:
    if payload.startswith(PNG_SIGNATURE):
        return ".png", "image/png"
    if payload.startswith(b"\xff\xd8"):
        return ".jpg", "image/jpeg"
    if len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
        return ".webp", "image/webp"
    return None


def _read_thumbnail_relation_target(archive: ZipFile) -> str | None:
    try:
        rel_payload = archive.read("_rels/.rels")
    except KeyError:
        return None

    try:
        root = ElementTree.fromstring(rel_payload)
    except ElementTree.ParseError:
        return None

    for rel in root.findall(".//{*}Relationship"):
        if rel.attrib.get("Type", "").strip() != THUMBNAIL_REL_TYPE:
            continue
        target = rel.attrib.get("Target", "").strip()
        if not target:
            continue
        return _normalize_zip_name(target)
    return None


def _candidate_thumbnail_names(archive: ZipFile) -> list[str]:
    # Сначала берём путь из relationship, затем fallback по имени файлов в архиве.
    candidates: list[str] = []
    rel_target = _read_thumbnail_relation_target(archive)
    if rel_target:
        candidates.append(rel_target)

    for name in archive.namelist():
        normalized = _normalize_zip_name(name)
        if not normalized or normalized.endswith("/"):
            continue
        lowered = normalized.lower()
        ext = Path(lowered).suffix
        if ext not in SUPPORTED_IMAGE_EXTENSIONS:
            continue
        if lowered.startswith("metadata/") or "thumbnail" in lowered:
            candidates.append(normalized)

    # Убираем дубли, сохраняя порядок.
    return list(dict.fromkeys(candidates))


def extract_thumbnail_from_3mf(payload: bytes, *, max_bytes: int) -> ExtractedThumbnail | None:
    # Пытаемся достать встроенную миниатюру из 3MF (zip-пакета).
    try:
        with ZipFile(io.BytesIO(payload)) as archive:
            for name in _candidate_thumbnail_names(archive):
                normalized = _normalize_zip_name(name)
                try:
                    info = archive.getinfo(normalized)
                except KeyError:
                    continue
                if info.file_size <= 0 or info.file_size > max_bytes:
                    continue
                with archive.open(info) as fp:
                    image_payload = fp.read(max_bytes + 1)
                if not image_payload or len(image_payload) > max_bytes:
                    continue
                detected = _detect_content_type(image_payload)
                if detected is None:
                    continue
                ext, content_type = detected
                filename = _safe_thumbnail_filename(normalized, ext)
                return ExtractedThumbnail(
                    payload=image_payload,
                    filename=filename,
                    content_type=content_type,
                )
    except (BadZipFile, ValueError):
        return None

    return None
