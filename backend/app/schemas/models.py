from pydantic import BaseModel, Field


class ModelVersionCreate(BaseModel):
    model_id: str = Field(min_length=1)
    source_format: str = Field(default="step", min_length=1)
    owner_user_id: str | None = None
    created_by_user_id: str | None = None
    auth_provider: str | None = None
    auth_subject: str | None = None


class ModelVersionResponse(BaseModel):
    id: str
    model_id: str
    source_format: str
    status: str
    owner_user_id: str | None = None
    created_by_user_id: str | None = None
    updated_by_user_id: str | None = None
    auth_provider: str | None = None
    auth_subject: str | None = None
    storage_key_original: str | None = None
    storage_key_glb: str | None = None
    checksum: str | None = None
    size_bytes: int | None = None
    conversion_ms: int | None = None
    created_at: str | None = None
    updated_at: str | None = None


class UploadResponse(BaseModel):
    model_version: ModelVersionResponse
    queue_message_id: str


class ApprovalDecision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    comment: str | None = None
    created_by_user_id: str | None = None
