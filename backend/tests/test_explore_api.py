from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.metadata_store import create_model_version


def _mk_record(
    *,
    model_version_id: str,
    model_id: str,
    status: str,
    created_at: str,
    storage_key_glb: str | None,
) -> dict:
    return {
        "id": model_version_id,
        "model_id": model_id,
        "model_name": f"name_{model_id}",
        "model_description": f"desc_{model_id}",
        "model_category": "tools",
        "model_tags": ["cad", "mvp"],
        "source_format": "step",
        "conversion_profile": "balanced",
        "status": status,
        "owner_user_id": "owner_1",
        "created_by_user_id": "owner_1",
        "updated_by_user_id": "owner_1",
        "auth_provider": "dev",
        "auth_subject": "owner_1",
        "storage_key_original": f"originals/{model_version_id}.step",
        "storage_key_glb": storage_key_glb,
        "checksum": "abc",
        "size_bytes": 123,
        "created_at": created_at,
    }


def test_explore_feed_returns_ready_only_with_pagination(isolated_local_runtime) -> None:
    create_model_version(
        _mk_record(
            model_version_id="mv_old_ready",
            model_id="model_old",
            status="ready",
            created_at="2026-01-01T00:00:00+00:00",
            storage_key_glb="glb/mv_old_ready.glb",
        )
    )
    create_model_version(
        _mk_record(
            model_version_id="mv_processing",
            model_id="model_processing",
            status="processing",
            created_at="2026-02-01T00:00:00+00:00",
            storage_key_glb=None,
        )
    )
    create_model_version(
        _mk_record(
            model_version_id="mv_new_ready",
            model_id="model_new",
            status="ready",
            created_at="2026-03-01T00:00:00+00:00",
            storage_key_glb="glb/mv_new_ready.glb",
        )
    )

    with TestClient(app) as client:
        first = client.get("/api/v1/explore/model-versions", params={"limit": 1, "offset": 0})
        assert first.status_code == 200, first.text
        first_json = first.json()
        assert first_json["next_offset"] == 1
        assert len(first_json["items"]) == 1
        assert first_json["items"][0]["id"] == "mv_new_ready"
        assert first_json["items"][0]["preview_available"] is True

        second = client.get("/api/v1/explore/model-versions", params={"limit": 1, "offset": 1})
        assert second.status_code == 200, second.text
        second_json = second.json()
        assert second_json["next_offset"] is None
        assert len(second_json["items"]) == 1
        assert second_json["items"][0]["id"] == "mv_old_ready"
