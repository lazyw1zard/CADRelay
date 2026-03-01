from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.core.config import settings


def _load_queue() -> dict[str, Any]:
    if not settings.queue_file.exists():
        return {"messages": []}
    with settings.queue_file.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _save_queue(queue: dict[str, Any]) -> None:
    settings.queue_file.parent.mkdir(parents=True, exist_ok=True)
    with settings.queue_file.open("w", encoding="utf-8") as fp:
        json.dump(queue, fp, ensure_ascii=True, indent=2)


def enqueue_conversion(model_version_id: str, storage_key_original: str) -> str:
    queue = _load_queue()
    message_id = f"msg_{uuid4().hex[:12]}"
    queue["messages"].append(
        {
            "id": message_id,
            "topic": "conversion_requested",
            "status": "pending",
            "created_at": datetime.now(UTC).isoformat(),
            "payload": {
                "model_version_id": model_version_id,
                "storage_key_original": storage_key_original,
            },
        }
    )
    _save_queue(queue)
    return message_id
