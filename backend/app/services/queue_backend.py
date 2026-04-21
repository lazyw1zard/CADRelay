from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import uuid4

from app.core.config import settings


class QueueBackend(Protocol):
    backend_name: str

    def enqueue_conversion(self, model_version_id: str, storage_key_original: str) -> str: ...

    def remove_messages_for_model(self, model_version_id: str) -> int: ...

    def load_messages(self) -> list[dict[str, Any]]: ...

    def save_messages(self, messages: list[dict[str, Any]]) -> None: ...


class LocalQueueBackend:
    backend_name = "local"

    def _read_queue(self) -> dict[str, Any]:
        # Если файла очереди еще нет, считаем очередь пустой.
        if not settings.queue_file.exists():
            return {"messages": []}
        with settings.queue_file.open("r", encoding="utf-8") as fp:
            return json.load(fp)

    def _write_queue(self, queue: dict[str, Any]) -> None:
        settings.queue_file.parent.mkdir(parents=True, exist_ok=True)
        with settings.queue_file.open("w", encoding="utf-8") as fp:
            json.dump(queue, fp, ensure_ascii=True, indent=2)

    def enqueue_conversion(self, model_version_id: str, storage_key_original: str) -> str:
        queue = self._read_queue()
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
        self._write_queue(queue)
        return message_id

    def remove_messages_for_model(self, model_version_id: str) -> int:
        queue = self._read_queue()
        before = len(queue["messages"])
        queue["messages"] = [
            m for m in queue["messages"] if (m.get("payload") or {}).get("model_version_id") != model_version_id
        ]
        removed = before - len(queue["messages"])
        if removed:
            self._write_queue(queue)
        return removed

    def load_messages(self) -> list[dict[str, Any]]:
        queue = self._read_queue()
        return list(queue.get("messages", []))

    def save_messages(self, messages: list[dict[str, Any]]) -> None:
        self._write_queue({"messages": messages})


class _NotImplementedQueueBackend:
    def __init__(self, backend_name: str) -> None:
        self.backend_name = backend_name

    def _raise(self) -> None:
        raise RuntimeError(
            f"Queue backend '{self.backend_name}' is not implemented in MVP yet. "
            "Use CADRELAY_QUEUE_BACKEND=local."
        )

    def enqueue_conversion(self, model_version_id: str, storage_key_original: str) -> str:
        self._raise()

    def remove_messages_for_model(self, model_version_id: str) -> int:
        self._raise()

    def load_messages(self) -> list[dict[str, Any]]:
        self._raise()

    def save_messages(self, messages: list[dict[str, Any]]) -> None:
        self._raise()


_queue_backend: QueueBackend | None = None


def _build_backend() -> QueueBackend:
    if settings.queue_backend == "local":
        return LocalQueueBackend()
    if settings.queue_backend == "redis":
        return _NotImplementedQueueBackend("redis")
    if settings.queue_backend == "sqs":
        return _NotImplementedQueueBackend("sqs")
    raise RuntimeError(
        f"Unsupported queue backend: {settings.queue_backend}. "
        "Allowed values: local, redis, sqs."
    )


def get_queue_backend() -> QueueBackend:
    global _queue_backend
    if _queue_backend is None:
        _queue_backend = _build_backend()
    return _queue_backend


def reset_queue_backend_cache() -> None:
    # Нужен в тестах и при смене настроек на лету.
    global _queue_backend
    _queue_backend = None
