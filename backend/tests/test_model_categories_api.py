from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_model_categories_defaults_and_admin_create(isolated_local_runtime) -> None:
    with TestClient(app) as client:
        initial = client.get("/api/v1/model-categories")
        assert initial.status_code == 200, initial.text
        labels = [row["label"] for row in initial.json()]
        assert "Tools" in labels

        created = client.post("/api/v1/admin/model-categories", json={"label": "Fixtures"})
        assert created.status_code == 200, created.text
        assert created.json()["label"] == "Fixtures"
        assert created.json()["active"] is True

        public = client.get("/api/v1/model-categories")
        assert public.status_code == 200, public.text
        assert "Fixtures" in [row["label"] for row in public.json()]


def test_admin_delete_model_category_hides_from_public_list(isolated_local_runtime) -> None:
    with TestClient(app) as client:
        created = client.post("/api/v1/admin/model-categories", json={"label": "Temporary"})
        assert created.status_code == 200, created.text
        category_id = created.json()["id"]

        deleted = client.delete(f"/api/v1/admin/model-categories/{category_id}")
        assert deleted.status_code == 200, deleted.text
        assert deleted.json()["active"] is False

        public = client.get("/api/v1/model-categories")
        assert public.status_code == 200, public.text
        assert "Temporary" not in [row["label"] for row in public.json()]


def test_admin_update_model_category_label_and_sort_order(isolated_local_runtime) -> None:
    with TestClient(app) as client:
        created = client.post("/api/v1/admin/model-categories", json={"label": "Late"})
        assert created.status_code == 200, created.text
        category_id = created.json()["id"]

        updated = client.patch(
            f"/api/v1/admin/model-categories/{category_id}",
            json={"label": "Early", "sort_order": 1},
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["label"] == "Early"
        assert updated.json()["sort_order"] == 1

        public = client.get("/api/v1/model-categories")
        assert public.status_code == 200, public.text
        labels = [row["label"] for row in public.json()]
        assert labels[0] == "Early"
