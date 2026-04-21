from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.auth import ALLOWED_ROLES
from app.core.config import settings

_firebase_initialized = False
_firebase_auth_module: Any | None = None


def _firebase_credentials_path(credentials_path: str | None = None) -> Path:
    # Берем путь из аргумента или из backend/.env.
    raw = credentials_path or settings.firebase_auth_credentials or settings.google_application_credentials
    if not raw:
        raise RuntimeError("Firebase auth credentials are not configured")
    path = Path(raw)
    if not path.exists():
        raise RuntimeError(f"Firebase credentials file not found: {path}")
    return path


def _init_firebase_admin(credentials_path: str | None = None) -> None:
    # Ленивая инициализация SDK (один раз на процесс).
    global _firebase_initialized, _firebase_auth_module
    if _firebase_initialized:
        return
    try:
        import firebase_admin
        from firebase_admin import auth as firebase_auth
        from firebase_admin import credentials
    except Exception as exc:  # pragma: no cover - import/runtime env error
        raise RuntimeError("firebase-admin is not installed") from exc

    cred_path = _firebase_credentials_path(credentials_path)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(cred_path)))
    _firebase_auth_module = firebase_auth
    _firebase_initialized = True


def _parse_role_from_claims(claims: dict[str, Any]) -> str:
    # Нормализуем роль из claims; если нет, используем MVP-роль по умолчанию.
    role = claims.get("role")
    if isinstance(role, str) and role in ALLOWED_ROLES:
        return role
    roles = claims.get("roles")
    if isinstance(roles, list):
        for item in roles:
            if isinstance(item, str) and item in ALLOWED_ROLES:
                if item == "admin":
                    return "admin"
        for item in roles:
            if isinstance(item, str) and item in ALLOWED_ROLES:
                return item
    return "editor"


def list_auth_users(limit: int = 50, page_token: str | None = None) -> dict[str, Any]:
    # Страница пользователей Firebase для админского UI.
    if settings.auth_mode != "firebase":
        raise RuntimeError("Admin users endpoint requires CADRELAY_AUTH_MODE=firebase")
    _init_firebase_admin()
    assert _firebase_auth_module is not None

    page = _firebase_auth_module.list_users(page_token=page_token, max_results=max(1, min(limit, 200)))
    users: list[dict[str, Any]] = []
    for user in page.users:
        claims = dict(user.custom_claims or {})
        users.append(
            {
                "uid": user.uid,
                "email": user.email,
                "display_name": user.display_name,
                "disabled": bool(user.disabled),
                "email_verified": bool(user.email_verified),
                "role": _parse_role_from_claims(claims),
            }
        )
    return {
        "users": users,
        "next_page_token": page.next_page_token,
    }


def set_auth_user_role(uid: str, role: str, credentials_path: str | None = None) -> dict[str, Any]:
    # Обновляем custom claims и возвращаем актуальные данные пользователя.
    if role not in ALLOWED_ROLES:
        raise ValueError(f"Unsupported role: {role}")
    _init_firebase_admin(credentials_path=credentials_path)
    assert _firebase_auth_module is not None
    try:
        user = _firebase_auth_module.get_user(uid)
    except Exception as exc:
        raise LookupError(f"Firebase user not found: {uid}") from exc

    claims = dict(user.custom_claims or {})
    # Убираем legacy-массив ролей, чтобы не было "admin + editor" одновременно.
    claims.pop("roles", None)
    claims["role"] = role
    _firebase_auth_module.set_custom_user_claims(uid, claims)

    refreshed = _firebase_auth_module.get_user(uid)
    refreshed_claims = dict(refreshed.custom_claims or {})
    return {
        "uid": refreshed.uid,
        "email": refreshed.email,
        "display_name": refreshed.display_name,
        "disabled": bool(refreshed.disabled),
        "email_verified": bool(refreshed.email_verified),
        "role": _parse_role_from_claims(refreshed_claims),
    }
