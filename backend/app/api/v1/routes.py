from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.config import settings
from app.schemas.models import ApprovalDecision, ModelVersionCreate, ModelVersionResponse, UploadResponse
from app.services.local_db import add_approval, create_model_version, get_model_version, update_model_version
from app.services.queue import enqueue_conversion
from app.services.storage import save_original_bytes

router = APIRouter()
ALLOWED_SOURCE_FORMATS = {"step", "stp", "iges", "igs"}


@router.post("/uploads", response_model=UploadResponse)
async def upload_model(
    model_id: str = Form(...),
    source_format: str = Form("step"),
    file: UploadFile = File(...),
) -> UploadResponse:
    normalized_format = source_format.lower().strip()
    if normalized_format not in ALLOWED_SOURCE_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported source_format")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds max upload size")

    model_version_id = f"mv_{uuid4().hex[:12]}"
    storage_key_original, checksum, size_bytes = save_original_bytes(
        model_version_id=model_version_id,
        filename=file.filename or "upload.step",
        payload=payload,
    )

    record = create_model_version(
        {
            "id": model_version_id,
            "model_id": model_id,
            "source_format": normalized_format,
            "status": "uploaded",
            "storage_key_original": storage_key_original,
            "storage_key_glb": None,
            "checksum": checksum,
            "size_bytes": size_bytes,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )

    queue_message_id = enqueue_conversion(
        model_version_id=record["id"],
        storage_key_original=record["storage_key_original"],
    )
    record = update_model_version(record["id"], status="processing")
    if record is None:
        raise HTTPException(status_code=500, detail="Failed to update model version")

    return UploadResponse(
        model_version=ModelVersionResponse(**record),
        queue_message_id=queue_message_id,
    )


@router.post("/model-versions", response_model=ModelVersionResponse)
def create_model_version_endpoint(payload: ModelVersionCreate) -> ModelVersionResponse:
    model_version_id = f"mv_{uuid4().hex[:12]}"
    record = create_model_version(
        {
            "id": model_version_id,
            "model_id": payload.model_id,
            "source_format": payload.source_format,
            "status": "uploaded",
            "storage_key_original": None,
            "storage_key_glb": None,
            "checksum": None,
            "size_bytes": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )
    return ModelVersionResponse(**record)


@router.get("/model-versions/{model_version_id}", response_model=ModelVersionResponse)
def get_model_version_endpoint(model_version_id: str) -> ModelVersionResponse:
    record = get_model_version(model_version_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    return ModelVersionResponse(**record)


@router.post("/model-versions/{model_version_id}/approval")
def approve_model_version(model_version_id: str, payload: ApprovalDecision) -> dict[str, str]:
    record = get_model_version(model_version_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    approval_record = add_approval(
        {
            "model_version_id": model_version_id,
            "decision": payload.decision,
            "comment": payload.comment,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )
    return {
        "model_version_id": approval_record["model_version_id"],
        "decision": approval_record["decision"],
    }
