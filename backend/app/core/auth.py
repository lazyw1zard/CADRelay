from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import Depends, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

security = HTTPBearer(auto_error=False)
ALLOWED_ROLES = {"viewer", "editor", "reviewer", "admin"}


@dataclass(frozen=True)
class CurrentUser:
    user_id: str
    role: str = "viewer"
    # Для write/admin-операций требуем подтвержденный email.
    email_verified: bool = False
    auth_provider: str = "dev"
    auth_subject: str | None = None

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


_firebase_admin_module: Any | None = None
_firebase_auth_module: Any | None = None
_firebase_initialized = False


def _firebase_credentials_path() -> Path:
    raw = settings.firebase_auth_credentials or settings.google_application_credentials
    if not raw:
        raise HTTPException(status_code=503, detail="Firebase auth credentials are not configured")
    path = Path(raw)
    if not path.exists():
        raise HTTPException(status_code=503, detail=f"Firebase credentials file not found: {path}")
    return path


def _init_firebase_if_needed() -> None:
    global _firebase_admin_module, _firebase_auth_module, _firebase_initialized
    if _firebase_initialized:
        return

    try:
        import firebase_admin
        from firebase_admin import auth as firebase_auth
        from firebase_admin import credentials
    except Exception as exc:  # pragma: no cover - dependency error path
        raise HTTPException(status_code=503, detail="firebase-admin is not installed") from exc

    cred_path = _firebase_credentials_path()
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(cred_path)))

    _firebase_admin_module = firebase_admin
    _firebase_auth_module = firebase_auth
    _firebase_initialized = True


def _parse_role(claims: dict[str, Any]) -> str:
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
    # Для MVP новый пользователь без claims получает editor,
    # чтобы сразу можно было загружать и удалять свои модели.
    return "editor"


def get_current_user(
    token: HTTPAuthorizationCredentials | None = Depends(security),
    x_demo_user_id: str | None = Header(default=None),
    access_token: str | None = Query(default=None),
) -> CurrentUser:
    # Disabled mode оставляет текущий MVP-поток без login UI.
    if settings.auth_mode != "firebase":
        user_id = (x_demo_user_id or "demo_user").strip() or "demo_user"
        return CurrentUser(
            user_id=user_id,
            role="admin",
            email_verified=True,
            auth_provider="dev",
            auth_subject=user_id,
        )

    bearer_token = token.credentials if token and token.credentials else (access_token or "").strip()
    if not bearer_token:
        raise HTTPException(status_code=401, detail="Authorization bearer token is required")

    _init_firebase_if_needed()
    assert _firebase_auth_module is not None
    try:
        claims = _firebase_auth_module.verify_id_token(bearer_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Firebase token") from exc

    user_id = str(claims.get("uid", "")).strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Token does not contain uid")

    role = _parse_role(claims)
    return CurrentUser(
        user_id=user_id,
        role=role,
        # Firebase кладет этот флаг в claims id-токена.
        email_verified=bool(claims.get("email_verified")),
        auth_provider="firebase",
        auth_subject=str(claims.get("sub", user_id)),
    )
