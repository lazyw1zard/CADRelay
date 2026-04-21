from __future__ import annotations

from pathlib import Path

import trimesh
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from worker.app.main import process_next_message


def test_upload_worker_ready_flow_obj(isolated_local_runtime, tmp_path: Path) -> None:
    # Берем OBJ, чтобы тест не зависел от gmsh CAD-пайплайна.
    source = tmp_path / "sample.obj"
    mesh = trimesh.creation.box(extents=[10, 8, 6])
    mesh.export(source)

    with TestClient(app) as client:
        with source.open("rb") as fp:
            upload = client.post(
                "/api/v1/uploads",
                data={
                    "model_id": "model_smoke_obj",
                    "source_format": "obj",
                    "conversion_profile": "balanced",
                },
                files={"file": ("sample.obj", fp, "text/plain")},
            )

        assert upload.status_code == 200, upload.text
        payload = upload.json()
        model_version = payload["model_version"]
        model_version_id = model_version["id"]
        assert model_version["status"] == "processing"

        processed, status = process_next_message(settings.data_dir, target_model_version_id=model_version_id)
        assert processed is True
        assert status == f"processed:{model_version_id}"

        row = client.get(f"/api/v1/model-versions/{model_version_id}")
        assert row.status_code == 200, row.text
        row_json = row.json()
        assert row_json["status"] == "ready"
        assert row_json["storage_key_glb"]
        assert isinstance(row_json.get("conversion_ms"), int)

        glb = client.get(f"/api/v1/model-versions/{model_version_id}/download", params={"kind": "glb"})
        assert glb.status_code == 200
        assert glb.content[:4] == b"glTF"
