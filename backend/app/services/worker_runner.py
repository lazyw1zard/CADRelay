from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def run_worker_once_for_model(model_version_id: str) -> None:
    # Запускаем worker как отдельный процесс, чтобы не смешивать контексты API/конвертера.
    repo_root = Path(__file__).resolve().parents[3]
    worker_main = repo_root / "worker" / "app" / "main.py"
    cmd = [sys.executable, str(worker_main), "--once", "--model-version-id", model_version_id]
    subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
    )
