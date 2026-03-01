from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _default_data_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "backend" / "data"


def _load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fp:
        json.dump(value, fp, ensure_ascii=True, indent=2)


def process_next_message(data_dir: Path) -> bool:
    # Берем пути к локальным файлам очереди/метаданных/артефактов.
    queue_file = data_dir / "queue.json"
    metadata_file = data_dir / "metadata.json"
    storage_dir = data_dir / "storage"

    queue = _load_json(queue_file, {"messages": []})
    metadata = _load_json(metadata_file, {"model_versions": {}, "approvals": []})

    # Ищем первую задачу, которая еще не обработана.
    pending = next((m for m in queue["messages"] if m.get("status") == "pending"), None)
    if pending is None:
        return False

    # Проверяем, что в задаче есть id версии модели.
    payload = pending.get("payload", {})
    model_version_id = payload.get("model_version_id")
    if not model_version_id:
        pending["status"] = "failed"
        pending["error"] = "missing model_version_id"
        _write_json(queue_file, queue)
        return True

    # Проверяем, что такая версия модели вообще существует.
    record = metadata["model_versions"].get(model_version_id)
    if record is None:
        pending["status"] = "failed"
        pending["error"] = "model_version not found"
        _write_json(queue_file, queue)
        return True

    # Пока это заглушка: создаем тестовый GLB, чтобы проверить весь pipeline.
    glb_key = f"glb/{model_version_id}.glb"
    glb_path = storage_dir / glb_key
    glb_path.parent.mkdir(parents=True, exist_ok=True)
    glb_path.write_bytes(b"mock glb payload")

    # Помечаем модель как готовую после "конвертации".
    record["status"] = "ready"
    record["storage_key_glb"] = glb_key
    record["updated_at"] = datetime.now(UTC).isoformat()
    metadata["model_versions"][model_version_id] = record

    # Помечаем задачу в очереди как обработанную.
    pending["status"] = "processed"
    pending["processed_at"] = datetime.now(UTC).isoformat()

    _write_json(metadata_file, metadata)
    _write_json(queue_file, queue)
    return True


def run_forever(data_dir: Path, poll_interval: float) -> None:
    while True:
        processed = process_next_message(data_dir)
        if not processed:
            # Если задач нет, немного ждем и проверяем снова.
            time.sleep(poll_interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CADRelay mock conversion worker")
    parser.add_argument("--once", action="store_true", help="Process a single pending message and exit")
    parser.add_argument("--data-dir", default=str(_default_data_dir()), help="Path to backend data directory")
    parser.add_argument("--poll-interval", type=float, default=2.0)
    args = parser.parse_args()

    target_dir = Path(args.data_dir)
    if args.once:
        # Удобно для ручной проверки: обработать 1 задачу и завершиться.
        changed = process_next_message(target_dir)
        print("processed" if changed else "idle")
    else:
        # Режим демона: worker постоянно слушает очередь.
        run_forever(target_dir, poll_interval=args.poll_interval)
