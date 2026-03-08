from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from time import perf_counter
from typing import Any


# Добавляем backend в PYTHONPATH, чтобы worker использовал те же сервисы,
# что и API (metadata_store/storage_store).
BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.metadata_store import get_model_version, update_model_version  # noqa: E402
from app.services.storage_store import load_bytes, save_glb_bytes  # noqa: E402
from converter import convert_cad_file_to_glb_bytes  # noqa: E402


SUPPORTED_EXTENSIONS = {
    "step": ".step",
    "stp": ".stp",
    "iges": ".iges",
    "igs": ".igs",
}


def _default_data_dir() -> Path:
    return BACKEND_DIR / "data"


def _load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        json.dump(value, fp, ensure_ascii=True, indent=2)


def _resolve_source_suffix(record: dict[str, Any], storage_key: str) -> str:
    # Сначала пробуем расширение из source_format, потом fallback из storage_key.
    source_format = str(record.get("source_format") or "").lower().strip()
    if source_format in SUPPORTED_EXTENSIONS:
        return SUPPORTED_EXTENSIONS[source_format]

    guessed = Path(storage_key).suffix.lower()
    if guessed in SUPPORTED_EXTENSIONS.values():
        return guessed

    return ".step"


def _mark_pending_failed(
    *,
    queue: dict[str, Any],
    queue_file: Path,
    pending: dict[str, Any],
    error: str,
    model_version_id: str | None,
) -> None:
    # Не удаляем задачу из очереди: оставляем историю с причиной ошибки.
    pending["status"] = "failed"
    pending["error"] = error
    if model_version_id:
        update_model_version(
            model_version_id,
            status="failed",
            updated_at=datetime.now(UTC).isoformat(),
        )
    _write_json(queue_file, queue)


def print_queue_stats(data_dir: Path, error_limit: int = 10) -> None:
    # Быстрая диагностика очереди без открытия огромного JSON вручную.
    queue_file = data_dir / "queue.json"
    queue = _load_json(queue_file, {"messages": []})
    messages = queue.get("messages", [])

    status_counts = Counter(str(m.get("status") or "unknown") for m in messages)
    print(f"queue_file={queue_file}")
    print(f"total={len(messages)}")
    print(f"pending={status_counts.get('pending', 0)}")
    print(f"processed={status_counts.get('processed', 0)}")
    print(f"failed={status_counts.get('failed', 0)}")

    failed_items = [m for m in messages if m.get("status") == "failed"]
    if not failed_items:
        print("last_errors=none")
        return

    # Показываем последние N ошибок (с конца), чтобы быстрее понять проблемы в очереди.
    print(f"last_errors={min(error_limit, len(failed_items))}")
    for item in list(reversed(failed_items))[:error_limit]:
        payload = item.get("payload") or {}
        model_version_id = payload.get("model_version_id") or "-"
        created_at = item.get("created_at") or "-"
        error = item.get("error") or "-"
        print(f"- id={item.get('id', '-')} model_version_id={model_version_id} created_at={created_at}")
        print(f"  error={error}")


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def prune_queue(data_dir: Path, keep_days: int = 7) -> tuple[int, int]:
    # Удаляем только старые processed/failed, pending не трогаем.
    queue_file = data_dir / "queue.json"
    queue = _load_json(queue_file, {"messages": []})
    messages = queue.get("messages", [])
    if not messages:
        return 0, 0

    cutoff = datetime.now(UTC) - timedelta(days=max(keep_days, 0))
    kept: list[dict[str, Any]] = []
    removed = 0

    for item in messages:
        status = str(item.get("status") or "")
        if status not in {"processed", "failed"}:
            kept.append(item)
            continue

        ref_ts = _parse_iso_datetime(item.get("processed_at")) or _parse_iso_datetime(item.get("created_at"))
        if ref_ts is not None and ref_ts < cutoff:
            removed += 1
            continue
        kept.append(item)

    if removed:
        queue["messages"] = kept
        _write_json(queue_file, queue)
    return removed, len(kept)


def process_next_message(data_dir: Path, target_model_version_id: str | None = None) -> tuple[bool, str]:
    # Очередь пока файловая (локальный MVP).
    queue_file = data_dir / "queue.json"
    queue = _load_json(queue_file, {"messages": []})

    pending_items = [m for m in queue["messages"] if m.get("status") == "pending"]
    if target_model_version_id:
        candidates = [
            m
            for m in pending_items
            if (m.get("payload") or {}).get("model_version_id") == target_model_version_id
        ]
    else:
        candidates = pending_items

    if not candidates:
        return False, "idle"

    # Без target id перебираем pending по порядку, пока не найдем валидную задачу.
    # Это защищает от сценария, когда первая задача в очереди битая и блокирует остальные.
    last_result = "idle"
    had_changes = False

    for pending in candidates:
        payload = pending.get("payload", {})
        model_version_id = payload.get("model_version_id")
        if not model_version_id:
            _mark_pending_failed(
                queue=queue,
                queue_file=queue_file,
                pending=pending,
                error="missing model_version_id",
                model_version_id=None,
            )
            had_changes = True
            last_result = "failed:missing model_version_id"
            if target_model_version_id:
                return True, last_result
            continue

        # Читаем запись через metadata_store (local/firestore по конфигу).
        record = get_model_version(model_version_id)
        if record is None:
            _mark_pending_failed(
                queue=queue,
                queue_file=queue_file,
                pending=pending,
                error="model_version not found",
                model_version_id=None,
            )
            had_changes = True
            last_result = f"failed:{model_version_id}:model_version not found"
            if target_model_version_id:
                return True, last_result
            continue

        # Берем ключ файла из payload, а если его нет - из метаданных.
        storage_key_original = payload.get("storage_key_original") or record.get("storage_key_original")
        if not storage_key_original:
            _mark_pending_failed(
                queue=queue,
                queue_file=queue_file,
                pending=pending,
                error="missing storage_key_original",
                model_version_id=model_version_id,
            )
            had_changes = True
            last_result = f"failed:{model_version_id}:missing storage_key_original"
            if target_model_version_id:
                return True, last_result
            continue

        try:
            # 1) Загружаем оригинальный CAD-файл из storage.
            source_bytes = load_bytes(storage_key_original)

            # 2) Во временной папке создаем входной файл с корректным расширением.
            suffix = _resolve_source_suffix(record, storage_key_original)
            with tempfile.TemporaryDirectory(prefix="cadrelay_worker_") as tmp_dir:
                input_path = Path(tmp_dir) / f"source{suffix}"
                input_path.write_bytes(source_bytes)

                # 3) Конвертируем CAD -> GLB.
                # Замеряем только чистое время конвертации (без очереди и сетевых вызовов).
                started_at = perf_counter()
                glb_bytes = convert_cad_file_to_glb_bytes(input_path)
                conversion_ms = int((perf_counter() - started_at) * 1000)

            # 4) Сохраняем GLB и отмечаем запись как ready.
            glb_key = save_glb_bytes(model_version_id, glb_bytes)

            updated = update_model_version(
                model_version_id,
                status="ready",
                storage_key_glb=glb_key,
                conversion_ms=conversion_ms,
                updated_at=datetime.now(UTC).isoformat(),
            )
            if updated is None:
                raise RuntimeError("failed to update model version")

            pending["status"] = "processed"
            pending["processed_at"] = datetime.now(UTC).isoformat()
            pending["conversion_ms"] = conversion_ms
            _write_json(queue_file, queue)
            print(f"conversion_ms model_version_id={model_version_id} value={conversion_ms}")
            return True, f"processed:{model_version_id}"
        except Exception as exc:  # noqa: BLE001
            _mark_pending_failed(
                queue=queue,
                queue_file=queue_file,
                pending=pending,
                error=str(exc),
                model_version_id=model_version_id,
            )
            had_changes = True
            last_result = f"failed:{model_version_id}:{exc}"
            if target_model_version_id:
                return True, last_result

    return (True, last_result) if had_changes else (False, "idle")


def run_forever(data_dir: Path, poll_interval: float) -> None:
    while True:
        processed, _ = process_next_message(data_dir)
        if not processed:
            time.sleep(poll_interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CADRelay conversion worker")
    parser.add_argument("--once", action="store_true", help="Process a single pending message and exit")
    parser.add_argument("--model-version-id", default=None, help="Process pending message for specific model_version_id")
    parser.add_argument("--queue-stats", action="store_true", help="Show queue status summary and exit")
    parser.add_argument("--error-limit", type=int, default=10, help="How many recent failed errors to print in --queue-stats mode")
    parser.add_argument("--queue-prune", action="store_true", help="Delete old processed/failed queue messages and exit")
    parser.add_argument("--prune-keep-days", type=int, default=7, help="How many days of processed/failed queue messages to keep")
    parser.add_argument("--data-dir", default=str(_default_data_dir()), help="Path to backend data directory")
    parser.add_argument("--poll-interval", type=float, default=2.0)
    args = parser.parse_args()

    target_dir = Path(args.data_dir)
    if args.queue_stats:
        print_queue_stats(target_dir, error_limit=max(args.error_limit, 1))
    elif args.queue_prune:
        removed, remaining = prune_queue(target_dir, keep_days=max(args.prune_keep_days, 0))
        print(f"queue_pruned removed={removed} remaining={remaining} keep_days={max(args.prune_keep_days, 0)}")
    elif args.once:
        changed, status = process_next_message(target_dir, target_model_version_id=args.model_version_id)
        print(status if changed else "idle")
    else:
        run_forever(target_dir, poll_interval=args.poll_interval)
