from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.queue import (
    enqueue_conversion,
    get_queue_backend_name,
    load_queue_messages,
    remove_messages_for_model,
)
from app.services.queue_backend import reset_queue_backend_cache


def test_local_queue_backend_roundtrip(isolated_local_runtime) -> None:
    message_id = enqueue_conversion("mv_queue_local", "originals/mv_queue_local_sample.step")
    assert message_id.startswith("msg_")
    assert get_queue_backend_name() == "local"

    messages = load_queue_messages()
    assert len(messages) == 1
    assert messages[0]["payload"]["model_version_id"] == "mv_queue_local"

    removed = remove_messages_for_model("mv_queue_local")
    assert removed == 1
    assert load_queue_messages() == []


def test_unimplemented_queue_backend_raises(isolated_local_runtime) -> None:
    settings.queue_backend = "redis"
    reset_queue_backend_cache()
    with pytest.raises(RuntimeError, match="not implemented in MVP yet"):
        enqueue_conversion("mv_queue_redis", "originals/mv_queue_redis.step")
