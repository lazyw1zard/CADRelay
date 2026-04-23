from __future__ import annotations

from base64 import b64decode
from io import BytesIO
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app.main import app

# Минимальный валидный PNG 1x1, чтобы детектор корректно распознал формат.
PNG_1X1 = b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7n4qkAAAAASUVORK5CYII="
)


def _make_3mf_with_thumbnail(thumbnail_bytes: bytes) -> bytes:
    # Формируем минимальный 3MF zip-пакет со встроенной миниатюрой.
    stream = BytesIO()
    with ZipFile(stream, "w") as zf:
        zf.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship
    Target="/Metadata/thumbnail.png"
    Id="rel0"
    Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>
</Relationships>
""",
        )
        zf.writestr("Metadata/thumbnail.png", thumbnail_bytes)
        zf.writestr("3D/3dmodel.model", "<model unit='millimeter' xmlns='http://schemas.microsoft.com/3dmanufacturing/core/2015/02'/>")
    return stream.getvalue()


def test_upload_3mf_uses_embedded_thumbnail(isolated_local_runtime) -> None:
    payload_3mf = _make_3mf_with_thumbnail(PNG_1X1)

    with TestClient(app) as client:
        upload = client.post(
            "/api/v1/uploads",
            data={
                "model_id": "model_thumb_embedded",
                "source_format": "3mf",
                "conversion_profile": "balanced",
            },
            files={"file": ("with-thumb.3mf", BytesIO(payload_3mf), "application/vnd.ms-package.3dmanufacturing-3dmodel+xml")},
        )

        assert upload.status_code == 200, upload.text
        model_version = upload.json()["model_version"]
        assert model_version["storage_key_thumbnail_custom"] is not None

        model_version_id = model_version["id"]
        thumb = client.get(f"/api/v1/model-versions/{model_version_id}/download", params={"kind": "thumbnail"})
        assert thumb.status_code == 200, thumb.text
        assert thumb.content == PNG_1X1
        assert thumb.headers.get("content-type", "").startswith("image/png")


def test_upload_3mf_prefers_user_thumbnail_over_embedded(isolated_local_runtime) -> None:
    payload_3mf = _make_3mf_with_thumbnail(PNG_1X1)
    custom_thumbnail = b"custom-thumbnail-from-user"

    with TestClient(app) as client:
        upload = client.post(
            "/api/v1/uploads",
            data={
                "model_id": "model_thumb_priority",
                "source_format": "3mf",
                "conversion_profile": "balanced",
            },
            files={
                "file": ("with-thumb.3mf", BytesIO(payload_3mf), "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"),
                "thumbnail_file": ("custom.png", BytesIO(custom_thumbnail), "image/png"),
            },
        )

        assert upload.status_code == 200, upload.text
        model_version = upload.json()["model_version"]
        model_version_id = model_version["id"]

        thumb = client.get(f"/api/v1/model-versions/{model_version_id}/download", params={"kind": "thumbnail"})
        assert thumb.status_code == 200, thumb.text
        assert thumb.content == custom_thumbnail
