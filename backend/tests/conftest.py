from __future__ import annotations

# ruff: noqa: E402

import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
WORKER_APP_DIR = ROOT_DIR / "worker" / "app"
if str(WORKER_APP_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_APP_DIR))

from app.core.config import settings
from app.services.metadata_store import init_metadata_store
from app.services.queue_backend import reset_queue_backend_cache


@pytest.fixture()
def isolated_local_runtime(tmp_path: Path):
    # Изолируем runtime-файлы тестов от реального backend/data.
    snapshot = {
        "data_dir": settings.data_dir,
        "storage_dir": settings.storage_dir,
        "originals_dir": settings.originals_dir,
        "glb_dir": settings.glb_dir,
        "metadata_file": settings.metadata_file,
        "queue_file": settings.queue_file,
        "metadata_backend": settings.metadata_backend,
        "storage_backend": settings.storage_backend,
        "queue_backend": settings.queue_backend,
        "auth_mode": settings.auth_mode,
        "auto_worker_enabled": settings.auto_worker_enabled,
    }

    data_dir = tmp_path / "data"
    storage_dir = data_dir / "storage"

    settings.data_dir = data_dir
    settings.storage_dir = storage_dir
    settings.originals_dir = storage_dir / "originals"
    settings.glb_dir = storage_dir / "glb"
    settings.metadata_file = data_dir / "metadata.json"
    settings.queue_file = data_dir / "queue.json"
    settings.metadata_backend = "local"
    settings.storage_backend = "local"
    settings.queue_backend = "local"
    settings.auth_mode = "disabled"
    settings.auto_worker_enabled = False
    reset_queue_backend_cache()
    init_metadata_store()

    try:
        yield
    finally:
        settings.data_dir = snapshot["data_dir"]
        settings.storage_dir = snapshot["storage_dir"]
        settings.originals_dir = snapshot["originals_dir"]
        settings.glb_dir = snapshot["glb_dir"]
        settings.metadata_file = snapshot["metadata_file"]
        settings.queue_file = snapshot["queue_file"]
        settings.metadata_backend = snapshot["metadata_backend"]
        settings.storage_backend = snapshot["storage_backend"]
        settings.queue_backend = snapshot["queue_backend"]
        settings.auth_mode = snapshot["auth_mode"]
        settings.auto_worker_enabled = snapshot["auto_worker_enabled"]
        reset_queue_backend_cache()
