from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
import re
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response

from app.core.auth import CurrentUser, get_current_user
from app.core.config import settings
from app.schemas.models import (
    AdminRoleUpdateRequest,
    AdminUserListResponse,
    AdminUserResponse,
    ApprovalDecision,
    ExploreModelCardResponse,
    ExploreModelListResponse,
    ModelVersionCreate,
    ModelVersionResponse,
    SavedModelListResponse,
    UploadResponse,
)
from app.services.firebase_auth_admin import delete_auth_user, list_auth_users, set_auth_user_role
from app.services.metadata_store import (
    add_approval,
    create_model_version,
    delete_model_version,
    delete_saved_models_for_model,
    delete_saved_models_for_user,
    get_model_version,
    list_saved_model_ids,
    list_model_versions,
    save_model_for_user,
    unsave_model_for_user,
    update_model_version,
)
from app.services.queue import enqueue_conversion, remove_messages_for_model
from app.services.storage_store import delete_bytes, load_bytes, save_original_bytes, save_thumbnail_bytes
from app.services.three_mf import extract_thumbnail_from_3mf
from app.services.worker_runner import run_worker_once_for_model

router = APIRouter()
# На MVP поддерживаем CAD + mesh-форматы для 3D-печати.
ALLOWED_SOURCE_FORMATS = {"step", "stp", "iges", "igs", "3mf", "stl", "obj"}
ALLOWED_CONVERSION_PROFILES = {"fast", "balanced", "high"}
ROLE_VIEW = {"viewer", "editor", "reviewer", "admin"}
ROLE_EDIT = {"editor", "admin"}
ROLE_REVIEW = {"editor", "reviewer", "admin"}
ROLE_ADMIN = {"admin"}
ALLOWED_THUMBNAIL_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_THUMBNAIL_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _ensure_role(current_user: CurrentUser, allowed: set[str]) -> None:
    # Единая проверка доступа по роли.
    if current_user.role not in allowed:
        raise HTTPException(status_code=403, detail=f"Role '{current_user.role}' is not allowed")


def _ensure_email_verified(current_user: CurrentUser) -> None:
    # Единое правило: любые операции изменения данных только после verify email.
    if not current_user.email_verified:
        raise HTTPException(status_code=403, detail="Email is not verified")


def _resolve_user_fields(
    owner_user_id: str | None,
    created_by_user_id: str | None,
    auth_provider: str | None,
    auth_subject: str | None,
    actor: CurrentUser,
) -> tuple[str, str, str, str]:
    if settings.auth_mode == "firebase":
        owner = actor.user_id
        creator = actor.user_id
        provider = actor.auth_provider
        subject = actor.auth_subject or actor.user_id
        return owner, creator, provider, subject

    owner = owner_user_id or created_by_user_id or actor.user_id
    creator = created_by_user_id or owner
    provider = auth_provider or actor.auth_provider
    subject = auth_subject or actor.auth_subject or creator
    return owner, creator, provider, subject


def _normalize_text(value: str | None, *, max_len: int) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.strip().split())
    if not cleaned:
        return None
    return cleaned[:max_len]


def _parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    # Разрешаем ввод через запятую/точку с запятой/новую строку.
    chunks = re.split(r"[,;\n]+", raw)
    result: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        tag = chunk.strip().lower()
        if not tag:
            continue
        if len(tag) > 32:
            tag = tag[:32]
        if tag in seen:
            continue
        seen.add(tag)
        result.append(tag)
        if len(result) >= 12:
            break
    return result


def _to_explore_card(row: dict) -> ExploreModelCardResponse:
    return ExploreModelCardResponse(
        id=row["id"],
        model_id=row["model_id"],
        model_name=row.get("model_name"),
        model_description=row.get("model_description"),
        model_category=row.get("model_category"),
        model_tags=row.get("model_tags") or [],
        source_format=row["source_format"],
        conversion_profile=row.get("conversion_profile"),
        status=row["status"],
        owner_user_id=row.get("owner_user_id"),
        created_at=row.get("created_at"),
        preview_available=bool(row.get("storage_key_glb")),
        custom_thumbnail_available=bool(row.get("storage_key_thumbnail_custom")),
    )


def _is_supported_thumbnail(upload: UploadFile) -> bool:
    ext = Path(upload.filename or "").suffix.lower()
    if ext in ALLOWED_THUMBNAIL_EXTENSIONS:
        return True
    content_type = (upload.content_type or "").lower().strip()
    return content_type in ALLOWED_THUMBNAIL_CONTENT_TYPES


def _thumbnail_media_type(storage_key: str) -> str:
    ext = Path(storage_key).suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    return "image/png"


@router.post("/uploads", response_model=UploadResponse)
async def upload_model(
    background_tasks: BackgroundTasks,
    model_id: str | None = Form(None),
    model_name: str | None = Form(None),
    model_description: str | None = Form(None),
    model_category: str | None = Form(None),
    model_tags: str | None = Form(None),
    source_format: str = Form("step"),
    conversion_profile: str = Form("balanced"),
    owner_user_id: str | None = Form(None),
    created_by_user_id: str | None = Form(None),
    auth_provider: str | None = Form(None),
    auth_subject: str | None = Form(None),
    file: UploadFile = File(...),
    thumbnail_file: UploadFile | None = File(None),
    current_user: CurrentUser = Depends(get_current_user),
) -> UploadResponse:
    _ensure_role(current_user, ROLE_EDIT)
    # Блокируем upload, пока пользователь не подтвердил почту.
    _ensure_email_verified(current_user)
    # Нормализуем и проверяем формат, чтобы не тащить неподдерживаемые файлы дальше.
    normalized_format = source_format.lower().strip()
    if normalized_format not in ALLOWED_SOURCE_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported source_format")
    normalized_profile = conversion_profile.lower().strip()
    if normalized_profile not in ALLOWED_CONVERSION_PROFILES:
        raise HTTPException(status_code=400, detail="Unsupported conversion_profile")
    normalized_name = _normalize_text(model_name, max_len=120)
    normalized_description = _normalize_text(model_description, max_len=2000)
    normalized_category = _normalize_text(model_category, max_len=64)
    normalized_tags = _parse_tags(model_tags)
    resolved_model_id = _normalize_text(model_id, max_len=120) or normalized_name or f"model_{uuid4().hex[:10]}"

    # Читаем файл в память и валидируем базовые ограничения.
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds max upload size")

    # Генерируем id версии модели заранее, чтобы привязать к нему все артефакты.
    model_version_id = f"mv_{uuid4().hex[:12]}"

    thumbnail_payload: bytes | None = None
    thumbnail_filename = "thumbnail.png"
    thumbnail_content_type: str | None = None
    if thumbnail_file is not None:
        if not _is_supported_thumbnail(thumbnail_file):
            raise HTTPException(status_code=400, detail="Unsupported thumbnail format")
        thumbnail_payload = await thumbnail_file.read()
        if thumbnail_payload:
            if len(thumbnail_payload) > settings.max_thumbnail_bytes:
                raise HTTPException(status_code=413, detail="Thumbnail exceeds max upload size")
            thumbnail_filename = thumbnail_file.filename or "thumbnail.png"
            thumbnail_content_type = thumbnail_file.content_type
    elif normalized_format == "3mf":
        # Если пользователь не приложил превью, пробуем взять встроенную миниатюру из 3MF.
        embedded_thumbnail = extract_thumbnail_from_3mf(payload, max_bytes=settings.max_thumbnail_bytes)
        if embedded_thumbnail is not None:
            thumbnail_payload = embedded_thumbnail.payload
            thumbnail_filename = embedded_thumbnail.filename
            thumbnail_content_type = embedded_thumbnail.content_type

    owner, creator, provider, subject = _resolve_user_fields(
        owner_user_id=owner_user_id,
        created_by_user_id=created_by_user_id,
        auth_provider=auth_provider,
        auth_subject=auth_subject,
        actor=current_user,
    )
    try:
        storage_key_thumbnail_custom: str | None = None
        if thumbnail_payload:
            # Сохраняем кастомную миниатюру пользователя для приоритетного показа в UI.
            storage_key_thumbnail_custom = save_thumbnail_bytes(
                model_version_id=model_version_id,
                filename=thumbnail_filename,
                payload=thumbnail_payload,
                content_type=thumbnail_content_type,
            )
        storage_key_original, checksum, size_bytes = save_original_bytes(
            model_version_id=model_version_id,
            filename=file.filename or "upload.step",
            payload=payload,
        )
    except RuntimeError as exc:
        # Ошибка конфигурации storage: клиент увидит явную проблему аутентификации/настроек.
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # Создаем запись о версии модели со статусом uploaded.
    record = create_model_version(
        {
            "id": model_version_id,
            "model_id": resolved_model_id,
            "model_name": normalized_name,
            "model_description": normalized_description,
            "model_category": normalized_category,
            "model_tags": normalized_tags,
            "source_format": normalized_format,
            "conversion_profile": normalized_profile,
            "status": "uploaded",
            "owner_user_id": owner,
            "created_by_user_id": creator,
            "updated_by_user_id": creator,
            "auth_provider": provider,
            "auth_subject": subject,
            "storage_key_original": storage_key_original,
            "storage_key_glb": None,
            "storage_key_thumbnail_custom": storage_key_thumbnail_custom,
            "checksum": checksum,
            "size_bytes": size_bytes,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )

    # Ставим задачу в очередь на конвертацию и меняем статус на processing.
    queue_message_id = enqueue_conversion(
        model_version_id=record["id"],
        storage_key_original=record["storage_key_original"],
    )
    record = update_model_version(record["id"], status="processing", updated_by_user_id=creator)
    if record is None:
        raise HTTPException(status_code=500, detail="Failed to update model version")

    # По умолчанию запускаем worker в фоне сразу после создания задачи.
    if settings.auto_worker_enabled:
        background_tasks.add_task(run_worker_once_for_model, record["id"])

    return UploadResponse(
        model_version=ModelVersionResponse(**record),
        queue_message_id=queue_message_id,
    )


@router.post("/model-versions", response_model=ModelVersionResponse)
def create_model_version_endpoint(
    payload: ModelVersionCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> ModelVersionResponse:
    _ensure_role(current_user, ROLE_EDIT)
    # Служебная запись тоже меняет данные -> нужен verified email.
    _ensure_email_verified(current_user)
    # Служебный endpoint: создает запись версии без загрузки файла.
    model_version_id = f"mv_{uuid4().hex[:12]}"
    normalized_name = _normalize_text(payload.model_name, max_len=120)
    normalized_description = _normalize_text(payload.model_description, max_len=2000)
    normalized_category = _normalize_text(payload.model_category, max_len=64)
    normalized_tags = _parse_tags(",".join(payload.model_tags or []))
    resolved_model_id = _normalize_text(payload.model_id, max_len=120) or normalized_name or f"model_{uuid4().hex[:10]}"
    owner, creator, provider, subject = _resolve_user_fields(
        owner_user_id=payload.owner_user_id,
        created_by_user_id=payload.created_by_user_id,
        auth_provider=payload.auth_provider,
        auth_subject=payload.auth_subject,
        actor=current_user,
    )
    record = create_model_version(
        {
            "id": model_version_id,
            "model_id": resolved_model_id,
            "model_name": normalized_name,
            "model_description": normalized_description,
            "model_category": normalized_category,
            "model_tags": normalized_tags,
            "source_format": payload.source_format,
            "conversion_profile": payload.conversion_profile,
            "status": "uploaded",
            "owner_user_id": owner,
            "created_by_user_id": creator,
            "updated_by_user_id": creator,
            "auth_provider": provider,
            "auth_subject": subject,
            "storage_key_original": None,
            "storage_key_glb": None,
            "storage_key_thumbnail_custom": None,
            "checksum": None,
            "size_bytes": None,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )
    return ModelVersionResponse(**record)


@router.get("/model-versions", response_model=list[ModelVersionResponse])
def list_model_versions_endpoint(
    owner_user_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    current_user: CurrentUser = Depends(get_current_user),
) -> list[ModelVersionResponse]:
    _ensure_role(current_user, ROLE_VIEW)
    # В auth-режиме по умолчанию показываем только свои модели.
    if settings.auth_mode == "firebase" and not current_user.is_admin:
        owner_filter = current_user.user_id
    else:
        owner_filter = owner_user_id
    rows = list_model_versions(owner_user_id=owner_filter, status=status, limit=limit)
    return [ModelVersionResponse(**row) for row in rows]


@router.get("/explore/model-versions", response_model=ExploreModelListResponse)
def list_explore_model_versions_endpoint(
    limit: int = Query(default=24, ge=1, le=60),
    offset: int = Query(default=0, ge=0),
) -> ExploreModelListResponse:
    # Публичная лента: отдаем только ready-модели с пагинацией.
    rows = list_model_versions(status="ready", limit=limit + 1, offset=offset)
    has_more = len(rows) > limit
    page_rows = rows[:limit]

    items = [_to_explore_card(row) for row in page_rows]
    next_offset = offset + limit if has_more else None
    return ExploreModelListResponse(items=items, next_offset=next_offset)


@router.get("/me/saved-models", response_model=SavedModelListResponse)
def list_saved_models_endpoint(
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedModelListResponse:
    _ensure_role(current_user, ROLE_VIEW)
    saved_ids = list_saved_model_ids(current_user.user_id)
    items: list[ExploreModelCardResponse] = []
    visible_ids: list[str] = []
    stale_ids: list[str] = []
    for model_version_id in saved_ids:
        record = get_model_version(model_version_id)
        if record is None:
            stale_ids.append(model_version_id)
            continue
        try:
            _ensure_can_read_access(record, current_user)
        except HTTPException:
            continue
        items.append(_to_explore_card(record))
        visible_ids.append(model_version_id)
    for model_version_id in stale_ids:
        unsave_model_for_user(current_user.user_id, model_version_id)
    return SavedModelListResponse(items=items, ids=visible_ids)


@router.put("/me/saved-models/{model_version_id}", response_model=SavedModelListResponse)
def save_model_endpoint(
    model_version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedModelListResponse:
    _ensure_role(current_user, ROLE_VIEW)
    record = get_model_version(model_version_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    _ensure_can_read_access(record, current_user)
    now = datetime.now(UTC).isoformat()
    save_model_for_user(
        {
            "id": f"{current_user.user_id}:{model_version_id}",
            "user_id": current_user.user_id,
            "model_version_id": model_version_id,
            "saved_at": now,
        }
    )
    return list_saved_models_endpoint(current_user=current_user)


@router.delete("/me/saved-models/{model_version_id}", response_model=SavedModelListResponse)
def unsave_model_endpoint(
    model_version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> SavedModelListResponse:
    _ensure_role(current_user, ROLE_VIEW)
    unsave_model_for_user(current_user.user_id, model_version_id)
    return list_saved_models_endpoint(current_user=current_user)


def _ensure_can_access(record: dict, current_user: CurrentUser) -> None:
    owner = record.get("owner_user_id")
    if current_user.is_admin:
        return
    if owner and owner != current_user.user_id:
        raise HTTPException(status_code=403, detail="Access denied")


def _ensure_can_read_access(record: dict, current_user: CurrentUser) -> None:
    # Чтение/скачивание ready-моделей разрешаем любому авторизованному пользователю.
    owner = record.get("owner_user_id")
    if current_user.is_admin:
        return
    if owner and owner == current_user.user_id:
        return
    if record.get("status") == "ready":
        return
    raise HTTPException(status_code=403, detail="Access denied")


def _delete_model_version_with_artifacts(record: dict) -> bool:
    model_version_id = str(record.get("id") or "")
    if not model_version_id:
        return False

    # Убираем сообщения из локальной очереди, чтобы worker не обрабатывал удаленную модель.
    remove_messages_for_model(model_version_id)

    for key in (
        record.get("storage_key_original"),
        record.get("storage_key_glb"),
        record.get("storage_key_thumbnail_custom"),
    ):
        if not key:
            continue
        try:
            delete_bytes(key)
        except Exception:
            # Если файла уже нет - не блокируем удаление карточки модели.
            pass

    delete_saved_models_for_model(model_version_id)
    return delete_model_version(model_version_id) is not None


@router.get("/model-versions/{model_version_id}", response_model=ModelVersionResponse)
def get_model_version_endpoint(
    model_version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> ModelVersionResponse:
    _ensure_role(current_user, ROLE_VIEW)
    # Endpoint для polling: фронт проверяет текущий статус обработки.
    record = get_model_version(model_version_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    _ensure_can_read_access(record, current_user)
    return ModelVersionResponse(**record)


@router.delete("/model-versions/{model_version_id}")
def delete_model_version_endpoint(
    model_version_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    _ensure_role(current_user, ROLE_EDIT)
    # Удаление версии и файлов разрешаем только с подтвержденным email.
    _ensure_email_verified(current_user)
    record = get_model_version(model_version_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    _ensure_can_access(record, current_user)

    if not _delete_model_version_with_artifacts(record):
        raise HTTPException(status_code=404, detail="Model version not found")
    return {"model_version_id": model_version_id, "status": "deleted"}


@router.delete("/me")
def delete_current_user_endpoint(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, int | str]:
    # Privacy/cleanup action: удаляем все модели владельца, затем Firebase Auth user.
    deleted_models = 0
    while True:
        owned_rows = list_model_versions(owner_user_id=current_user.user_id, limit=200)
        if not owned_rows:
            break
        for record in owned_rows:
            if _delete_model_version_with_artifacts(record):
                deleted_models += 1

    delete_saved_models_for_user(current_user.user_id)

    if settings.auth_mode == "firebase":
        try:
            delete_auth_user(current_user.user_id)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to delete Firebase user: {exc}") from exc

    return {"status": "deleted", "deleted_models": deleted_models}


@router.get("/model-versions/{model_version_id}/download")
def download_model_version_file(
    model_version_id: str,
    kind: str = Query(pattern="^(original|glb|thumbnail)$"),
    current_user: CurrentUser = Depends(get_current_user),
) -> Response:
    _ensure_role(current_user, ROLE_VIEW)
    record = get_model_version(model_version_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    _ensure_can_read_access(record, current_user)

    if kind == "original":
        storage_key = record.get("storage_key_original")
    elif kind == "glb":
        storage_key = record.get("storage_key_glb")
    else:
        storage_key = record.get("storage_key_thumbnail_custom")
    if not storage_key:
        raise HTTPException(status_code=404, detail=f"{kind} file is not available")

    try:
        payload = load_bytes(storage_key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"{kind} file not found in storage") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    filename = storage_key.split("/")[-1]
    if kind == "original":
        media_type = "application/octet-stream"
    elif kind == "glb":
        media_type = "model/gltf-binary"
    else:
        media_type = _thumbnail_media_type(storage_key)
    headers = {"Content-Disposition": f'attachment; filename=\"{filename}\"'}
    return Response(content=payload, media_type=media_type, headers=headers)


@router.post("/model-versions/{model_version_id}/approval")
def approve_model_version(
    model_version_id: str,
    payload: ApprovalDecision,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    _ensure_role(current_user, ROLE_REVIEW)
    # Approve/reject влияет на workflow, поэтому тоже с verify email.
    _ensure_email_verified(current_user)
    # Сохраняем решение клиента по версии модели (approve/reject).
    record = get_model_version(model_version_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    _ensure_can_access(record, current_user)

    approval_record = add_approval(
        {
            "model_version_id": model_version_id,
            "decision": payload.decision,
            "comment": payload.comment,
            "created_by_user_id": payload.created_by_user_id or current_user.user_id,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )
    return {
        "model_version_id": approval_record["model_version_id"],
        "decision": approval_record["decision"],
    }


@router.get("/admin/users", response_model=AdminUserListResponse)
def admin_list_users(
    limit: int = Query(default=50, ge=1, le=200),
    page_token: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
) -> AdminUserListResponse:
    # Админ читает список пользователей из Firebase Auth.
    _ensure_role(current_user, ROLE_ADMIN)
    # Доступ к админке разрешаем только верифицированному админу.
    _ensure_email_verified(current_user)
    try:
        result = list_auth_users(limit=limit, page_token=page_token)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    users = [AdminUserResponse(**row) for row in result.get("users", [])]
    return AdminUserListResponse(users=users, next_page_token=result.get("next_page_token"))


@router.post("/admin/users/{uid}/role", response_model=AdminUserResponse)
def admin_set_user_role(
    uid: str,
    payload: AdminRoleUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> AdminUserResponse:
    # Админ назначает роль через Firebase custom claims.
    _ensure_role(current_user, ROLE_ADMIN)
    # Изменение ролей тоже под verify email.
    _ensure_email_verified(current_user)
    try:
        row = set_auth_user_role(uid=uid, role=payload.role)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return AdminUserResponse(**row)
