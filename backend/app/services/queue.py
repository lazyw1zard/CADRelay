from __future__ import annotations

from typing import Any

from app.services.queue_backend import get_queue_backend


def enqueue_conversion(model_version_id: str, storage_key_original: str) -> str:
    # Публичный API для backend: добавить задачу конвертации.
    return get_queue_backend().enqueue_conversion(model_version_id, storage_key_original)


def remove_messages_for_model(model_version_id: str) -> int:
    # Удаляем все сообщения очереди, связанные с конкретной моделью.
    return get_queue_backend().remove_messages_for_model(model_version_id)


def load_queue_messages() -> list[dict[str, Any]]:
    # Worker читает текущее состояние очереди через этот слой.
    return get_queue_backend().load_messages()


def save_queue_messages(messages: list[dict[str, Any]]) -> None:
    # Worker сохраняет обновленные статусы сообщений через общий слой.
    get_queue_backend().save_messages(messages)


def get_queue_backend_name() -> str:
    return get_queue_backend().backend_name
