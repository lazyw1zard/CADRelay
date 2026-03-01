from fastapi import APIRouter

from app.schemas.models import ApprovalDecision, ModelVersionCreate, ModelVersionResponse

router = APIRouter()


@router.post("/model-versions", response_model=ModelVersionResponse)
def create_model_version(payload: ModelVersionCreate) -> ModelVersionResponse:
    return ModelVersionResponse(
        id="mv_mock_001",
        model_id=payload.model_id,
        source_format=payload.source_format,
        status="uploaded",
    )


@router.post("/model-versions/{model_version_id}/approval")
def approve_model_version(model_version_id: str, payload: ApprovalDecision) -> dict[str, str]:
    return {
        "model_version_id": model_version_id,
        "decision": payload.decision,
    }
