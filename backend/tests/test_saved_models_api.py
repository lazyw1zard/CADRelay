from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.metadata_store import create_model_version


def _create_model(model_version_id: str, owner_user_id: str, status: str = "ready") -> None:
    create_model_version(
        {
            "id": model_version_id,
            "model_id": model_version_id,
            "model_name": model_version_id,
            "source_format": "obj",
            "conversion_profile": "balanced",
            "status": status,
            "owner_user_id": owner_user_id,
            "created_by_user_id": owner_user_id,
            "updated_by_user_id": owner_user_id,
            "auth_provider": "dev",
            "auth_subject": owner_user_id,
            "storage_key_original": f"originals/{model_version_id}.obj",
            "storage_key_glb": f"glb/{model_version_id}.glb" if status == "ready" else None,
            "storage_key_thumbnail_custom": None,
        }
    )


def test_saved_models_roundtrip(isolated_local_runtime) -> None:
    _create_model("mv_saved_ready", "owner_1")

    with TestClient(app) as client:
        saved = client.put("/api/v1/me/saved-models/mv_saved_ready")
        assert saved.status_code == 200, saved.text
        assert saved.json()["ids"] == ["mv_saved_ready"]
        assert saved.json()["items"][0]["id"] == "mv_saved_ready"

        listed = client.get("/api/v1/me/saved-models")
        assert listed.status_code == 200, listed.text
        assert listed.json()["ids"] == ["mv_saved_ready"]

        removed = client.delete("/api/v1/me/saved-models/mv_saved_ready")
        assert removed.status_code == 200, removed.text
        assert removed.json() == {"items": [], "ids": []}


def test_delete_model_removes_saved_relation(isolated_local_runtime) -> None:
    _create_model("mv_saved_then_deleted", "demo_user")

    with TestClient(app) as client:
        assert client.put("/api/v1/me/saved-models/mv_saved_then_deleted").status_code == 200
        deleted = client.delete("/api/v1/model-versions/mv_saved_then_deleted")
        assert deleted.status_code == 200, deleted.text
        listed = client.get("/api/v1/me/saved-models")
        assert listed.status_code == 200, listed.text
        assert listed.json() == {"items": [], "ids": []}
