from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient

from app.main import app
from app.services.metadata_store import create_model_version, get_model_version
from app.services.queue import load_queue_messages


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


def test_full_edit_replaces_model_file_and_marks_updated(isolated_local_runtime) -> None:
    _create_model("mv_full_edit")

    with TestClient(app) as client:
        edited = client.put(
            "/api/v1/model-versions/mv_full_edit/full-edit",
            data={
                "model_name": "Edited model",
                "model_description": "Edited description",
                "model_category": "Games",
                "model_tags": "game, dice",
                "source_format": "obj",
                "conversion_profile": "fast",
            },
            files={
                "file": ("edited.obj", BytesIO(b"v 0 0 0\n"), "text/plain"),
                "thumbnail_file": ("preview.png", BytesIO(b"\x89PNG\r\n\x1a\n"), "image/png"),
            },
        )

    assert edited.status_code == 200, edited.text
    body = edited.json()
    assert body["model_name"] == "Edited model"
    assert body["model_description"] == "Edited description"
    assert body["model_category"] == "Games"
    assert body["model_tags"] == ["game", "dice"]
    assert body["source_format"] == "obj"
    assert body["conversion_profile"] == "fast"
    assert body["status"] == "processing"
    assert body["storage_key_original"].endswith("edited.obj")
    assert body["storage_key_glb"] is None
    assert body["storage_key_thumbnail_custom"].endswith(".png")
    assert body["updated_at"]
    assert get_model_version("mv_full_edit")["updated_at"]
    assert load_queue_messages()[0]["payload"]["model_version_id"] == "mv_full_edit"
