from typing import Literal

from pydantic import BaseModel, Field


class ModelVersionCreate(BaseModel):
    model_id: str = Field(min_length=1)
    source_format: str = Field(default="step", min_length=1)
    conversion_profile: str = Field(default="balanced", pattern="^(fast|balanced|high)$")
    owner_user_id: str | None = None
    created_by_user_id: str | None = None
    auth_provider: str | None = None
    auth_subject: str | None = None


class ModelVersionResponse(BaseModel):
    id: str
    model_id: str
    source_format: str
    conversion_profile: str | None = None
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


class AdminRoleUpdateRequest(BaseModel):
    # Новая роль пользователя, которую задает администратор.
    role: Literal["viewer", "editor", "reviewer", "admin"]


class AdminUserResponse(BaseModel):
    # UID из Firebase Auth.
    uid: str
    email: str | None = None
    display_name: str | None = None
    disabled: bool = False
    email_verified: bool = False
    role: Literal["viewer", "editor", "reviewer", "admin"]


class AdminUserListResponse(BaseModel):
    # Страница пользователей для админского интерфейса.
    users: list[AdminUserResponse]
    # Токен следующей страницы (если пользователей много).
    next_page_token: str | None = None
