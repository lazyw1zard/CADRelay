from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import pbkdf2_hmac, sha256
import base64
import hmac
import re
import secrets
from typing import Any
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from app.core.config import settings

PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 310_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ALLOWED_ROLES = {"viewer", "editor", "reviewer", "admin"}


def _connect() -> psycopg.Connection:
    if not settings.postgres_dsn:
        raise RuntimeError("CADRELAY_POSTGRES_DSN or DATABASE_URL is required for postgres auth")
    return psycopg.connect(settings.postgres_dsn, row_factory=dict_row)


def _now() -> datetime:
    return datetime.now(UTC)


def _normalize_email(email: str) -> str:
    value = email.strip().lower()
    if not EMAIL_RE.match(value):
        raise ValueError("Invalid email")
    return value


def _hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "$".join(
        [
            PASSWORD_ALGORITHM,
            str(PASSWORD_ITERATIONS),
            base64.b64encode(salt).decode("ascii"),
            base64.b64encode(digest).decode("ascii"),
        ]
    )


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = stored_hash.split("$", 3)
        if algorithm != PASSWORD_ALGORITHM:
            return False
        iterations = int(iterations_raw)
        salt = base64.b64decode(salt_raw.encode("ascii"))
        expected = base64.b64decode(digest_raw.encode("ascii"))
    except Exception:
        return False
    actual = pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


def _public_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "uid": row["id"],
        "email": row.get("email"),
        "display_name": row.get("display_name"),
        "disabled": bool(row.get("disabled", False)),
        "email_verified": bool(row.get("email_verified", False)),
        "role": row.get("role") or "editor",
    }


def init_auth_store() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_users (
                    id text PRIMARY KEY,
                    email text NOT NULL UNIQUE,
                    display_name text,
                    password_hash text NOT NULL,
                    role text NOT NULL DEFAULT 'editor',
                    disabled boolean NOT NULL DEFAULT false,
                    email_verified boolean NOT NULL DEFAULT true,
                    created_at timestamptz NOT NULL,
                    updated_at timestamptz NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS app_sessions (
                    token_hash text PRIMARY KEY,
                    user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
                    created_at timestamptz NOT NULL,
                    expires_at timestamptz NOT NULL
                )
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id)")
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON app_sessions(expires_at)"
            )


def _create_session(conn: psycopg.Connection, user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    now = _now()
    expires_at = now + timedelta(days=max(1, settings.auth_session_days))
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO app_sessions (token_hash, user_id, created_at, expires_at)
            VALUES (%s, %s, %s, %s)
            """,
            (_hash_token(token), user_id, now, expires_at),
        )
    return token


def create_user_session(*, email: str, password: str, display_name: str | None = None) -> dict[str, Any]:
    init_auth_store()
    normalized_email = _normalize_email(email)
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    cleaned_name = " ".join((display_name or "").strip().split())[:80] or None
    now = _now()

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS count FROM app_users")
            is_first_user = int(cur.fetchone()["count"]) == 0
            role = "admin" if is_first_user or normalized_email in settings.bootstrap_admin_emails else "editor"
            user_id = f"user_{uuid4().hex}"
            try:
                cur.execute(
                    """
                    INSERT INTO app_users (
                        id, email, display_name, password_hash, role,
                        disabled, email_verified, created_at, updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, false, true, %s, %s)
                    RETURNING *
                    """,
                    (
                        user_id,
                        normalized_email,
                        cleaned_name,
                        _hash_password(password),
                        role,
                        now,
                        now,
                    ),
                )
            except psycopg.errors.UniqueViolation as exc:
                raise ValueError("Email is already registered") from exc
            row = cur.fetchone()
        token = _create_session(conn, user_id)
    return {"access_token": token, "token_type": "bearer", "user": _public_user(row)}


def login_user_session(*, email: str, password: str) -> dict[str, Any]:
    init_auth_store()
    normalized_email = _normalize_email(email)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM app_users WHERE email = %s", (normalized_email,))
            row = cur.fetchone()
            if row is None or not _verify_password(password, row["password_hash"]):
                raise PermissionError("Invalid email or password")
            if row.get("disabled"):
                raise PermissionError("User is disabled")
        token = _create_session(conn, row["id"])
    return {"access_token": token, "token_type": "bearer", "user": _public_user(row)}


def get_user_by_session_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    init_auth_store()
    token_hash = _hash_token(token)
    now = _now()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM app_sessions WHERE expires_at <= %s", (now,))
            cur.execute(
                """
                SELECT u.*
                FROM app_sessions s
                JOIN app_users u ON u.id = s.user_id
                WHERE s.token_hash = %s
                  AND s.expires_at > %s
                  AND u.disabled = false
                """,
                (token_hash, now),
            )
            row = cur.fetchone()
            return _public_user(row) if row else None


def get_user(user_id: str) -> dict[str, Any] | None:
    init_auth_store()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM app_users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            return _public_user(row) if row else None


def revoke_user_session(token: str) -> None:
    if not token:
        return
    init_auth_store()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM app_sessions WHERE token_hash = %s", (_hash_token(token),))


def update_user_display_name(user_id: str, display_name: str | None) -> dict[str, Any] | None:
    init_auth_store()
    cleaned_name = " ".join((display_name or "").strip().split())[:80] or None
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE app_users
                SET display_name = %s, updated_at = %s
                WHERE id = %s
                RETURNING *
                """,
                (cleaned_name, _now(), user_id),
            )
            row = cur.fetchone()
            return _public_user(row) if row else None


def delete_user(user_id: str) -> None:
    init_auth_store()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM app_users WHERE id = %s", (user_id,))


def list_users(limit: int = 50, page_token: str | None = None) -> dict[str, Any]:
    init_auth_store()
    safe_limit = max(1, min(limit, 200))
    offset = 0
    if page_token:
        try:
            offset = max(0, int(page_token))
        except ValueError:
            offset = 0
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM app_users
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (safe_limit + 1, offset),
            )
            rows = cur.fetchall()
    has_more = len(rows) > safe_limit
    users = [_public_user(row) for row in rows[:safe_limit]]
    return {
        "users": users,
        "next_page_token": str(offset + safe_limit) if has_more else None,
    }


def set_user_role(user_id: str, role: str) -> dict[str, Any]:
    init_auth_store()
    if role not in ALLOWED_ROLES:
        raise ValueError(f"Unsupported role: {role}")
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE app_users
                SET role = %s, updated_at = %s
                WHERE id = %s
                RETURNING *
                """,
                (role, _now(), user_id),
            )
            row = cur.fetchone()
            if row is None:
                raise LookupError(f"User not found: {user_id}")
            return _public_user(row)
