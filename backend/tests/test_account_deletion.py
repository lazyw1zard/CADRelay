from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.metadata_store import create_model_version, get_model_version


def _create_model(model_version_id: str, owner_user_id: str, storage_key: str) -> None:
    target = settings.storage_dir / storage_key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"model-bytes")
    create_model_version(
        {
            "id": model_version_id,
            "model_id": model_version_id,
            "model_name": model_version_id,
            "source_format": "obj",
            "conversion_profile": "balanced",
            "status": "ready",
            "owner_user_id": owner_user_id,
            "created_by_user_id": owner_user_id,
            "updated_by_user_id": owner_user_id,
            "auth_provider": "dev",
            "auth_subject": owner_user_id,
            "storage_key_original": storage_key,
            "storage_key_glb": None,
            "storage_key_thumbnail_custom": None,
        }
    )


def test_delete_current_account_removes_owned_models_and_files(isolated_local_runtime) -> None:
    _create_model("mv_owned_delete", "demo_user", "originals/mv_owned_delete.obj")
    _create_model("mv_other_keep", "other_user", "originals/mv_other_keep.obj")

    with TestClient(app) as client:
        resp = client.delete("/api/v1/me")

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"status": "deleted", "deleted_models": 1}
    assert get_model_version("mv_owned_delete") is None
    assert not (settings.storage_dir / "originals/mv_owned_delete.obj").exists()
    assert get_model_version("mv_other_keep") is not None
    assert (settings.storage_dir / "originals/mv_other_keep.obj").exists()
