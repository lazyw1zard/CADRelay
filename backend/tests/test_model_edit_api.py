from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.metadata_store import create_model_version, get_model_version


def _create_model(model_version_id: str, owner_user_id: str = "demo_user") -> None:
    create_model_version(
        {
            "id": model_version_id,
            "model_id": model_version_id,
            "model_name": "Old name",
            "model_description": "Old description",
            "model_category": "Tools",
            "model_tags": ["old"],
            "source_format": "obj",
            "conversion_profile": "balanced",
            "status": "ready",
            "owner_user_id": owner_user_id,
            "created_by_user_id": owner_user_id,
            "updated_by_user_id": owner_user_id,
            "auth_provider": "dev",
            "auth_subject": owner_user_id,
            "storage_key_original": f"originals/{model_version_id}.obj",
            "storage_key_glb": f"glb/{model_version_id}.glb",
            "storage_key_thumbnail_custom": None,
        }
    )


def test_update_model_version_metadata(isolated_local_runtime) -> None:
    _create_model("mv_editable")

    with TestClient(app) as client:
        updated = client.patch(
            "/api/v1/model-versions/mv_editable",
            json={
                "model_name": "New name",
                "model_description": "New description",
                "model_category": "Mechanical",
                "model_tags": ["Clamp", "Fixture"],
            },
        )

    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["model_name"] == "New name"
    assert body["model_description"] == "New description"
    assert body["model_category"] == "Mechanical"
    assert body["model_tags"] == ["clamp", "fixture"]
    assert get_model_version("mv_editable")["updated_at"]


def test_model_reaction_endpoint_records_signal(isolated_local_runtime) -> None:
    _create_model("mv_reacted")

    with TestClient(app) as client:
        reacted = client.post("/api/v1/model-versions/mv_reacted/reaction", json={"decision": "like"})

    assert reacted.status_code == 200, reacted.text
    assert reacted.json() == {"model_version_id": "mv_reacted", "decision": "like"}
