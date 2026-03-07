from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


# Добавляем backend в PYTHONPATH, чтобы worker использовал те же сервисы,
# что и API (metadata_store/storage_store).
BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.metadata_store import get_model_version, update_model_version  # noqa: E402
from app.services.storage_store import save_glb_bytes  # noqa: E402


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


def process_next_message(data_dir: Path, target_model_version_id: str | None = None) -> tuple[bool, str]:
    # Очередь пока файловая (локальный MVP).
    queue_file = data_dir / "queue.json"
    queue = _load_json(queue_file, {"messages": []})

    pending_items = [m for m in queue["messages"] if m.get("status") == "pending"]
    if target_model_version_id:
        pending = next(
            (
                m
                for m in pending_items
                if (m.get("payload") or {}).get("model_version_id") == target_model_version_id
            ),
            None,
        )
    else:
        pending = pending_items[0] if pending_items else None
    if pending is None:
        return False, "idle"

    payload = pending.get("payload", {})
    model_version_id = payload.get("model_version_id")
    if not model_version_id:
        pending["status"] = "failed"
        pending["error"] = "missing model_version_id"
        _write_json(queue_file, queue)
        return True, "failed:missing model_version_id"

    # Важно: читаем запись через metadata_store (local/firestore по конфигу).
    record = get_model_version(model_version_id)
    if record is None:
        pending["status"] = "failed"
        pending["error"] = "model_version not found"
        _write_json(queue_file, queue)
        return True, f"failed:{model_version_id}:model_version not found"

    try:
        # Пока заглушка конвертации: пишем тестовый GLB через storage_store.
        glb_key = save_glb_bytes(model_version_id, b"mock glb payload")

        updated = update_model_version(
            model_version_id,
            status="ready",
            storage_key_glb=glb_key,
            updated_at=datetime.now(UTC).isoformat(),
        )
        if updated is None:
            raise RuntimeError("failed to update model version")

        pending["status"] = "processed"
        pending["processed_at"] = datetime.now(UTC).isoformat()
        result = f"processed:{model_version_id}"
    except Exception as exc:  # noqa: BLE001
        pending["status"] = "failed"
        pending["error"] = str(exc)
        update_model_version(
            model_version_id,
            status="failed",
            updated_at=datetime.now(UTC).isoformat(),
        )
        result = f"failed:{model_version_id}:{exc}"

    _write_json(queue_file, queue)
    return True, result


def run_forever(data_dir: Path, poll_interval: float) -> None:
    while True:
        processed, _ = process_next_message(data_dir)
        if not processed:
            time.sleep(poll_interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CADRelay mock conversion worker")
    parser.add_argument("--once", action="store_true", help="Process a single pending message and exit")
    parser.add_argument("--model-version-id", default=None, help="Process pending message for specific model_version_id")
    parser.add_argument("--data-dir", default=str(_default_data_dir()), help="Path to backend data directory")
    parser.add_argument("--poll-interval", type=float, default=2.0)
    args = parser.parse_args()

    target_dir = Path(args.data_dir)
    if args.once:
        changed, status = process_next_message(target_dir, target_model_version_id=args.model_version_id)
        print(status if changed else "idle")
    else:
        run_forever(target_dir, poll_interval=args.poll_interval)
