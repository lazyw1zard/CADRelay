from pydantic import BaseModel, Field


class ModelVersionCreate(BaseModel):
    model_id: str = Field(min_length=1)
    source_format: str = Field(default="step", min_length=1)


class ModelVersionResponse(BaseModel):
    id: str
    model_id: str
    source_format: str
    status: str


class ApprovalDecision(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    comment: str | None = None
