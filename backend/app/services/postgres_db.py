from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.core.config import settings
from app.services.local_db import DEFAULT_CATEGORIES, _category_id

MODEL_VERSION_COLUMNS = [
    "id",
    "model_id",
    "model_name",
    "model_description",
    "model_category",
    "model_tags",
    "source_format",
    "conversion_profile",
    "status",
    "visibility",
    "share_token",
    "owner_user_id",
    "created_by_user_id",
    "updated_by_user_id",
    "auth_provider",
    "auth_subject",
    "storage_key_original",
    "storage_key_glb",
    "storage_key_thumbnail_custom",
    "checksum",
    "size_bytes",
    "conversion_ms",
    "created_at",
    "updated_at",
]


def _connect() -> psycopg.Connection:
    if not settings.postgres_dsn:
        raise RuntimeError("CADRELAY_POSTGRES_DSN or DATABASE_URL is required for postgres backend")
    return psycopg.connect(settings.postgres_dsn, row_factory=dict_row)


def _jsonb(value: Any) -> Jsonb:
    return Jsonb(value if value is not None else [])


def _model_params(record: dict[str, Any]) -> dict[str, Any]:
    params = {column: record.get(column) for column in MODEL_VERSION_COLUMNS}
    params["model_tags"] = _jsonb(record.get("model_tags") or [])
    return params


def _normalize_model_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    row["model_tags"] = row.get("model_tags") or []
    return row


def _normalize_category_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    row["active"] = bool(row.get("active", True))
    row["sort_order"] = 100 if row.get("sort_order") is None else int(row["sort_order"])
    return row


def init_metadata_store() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS model_versions (
                    id text PRIMARY KEY,
                    model_id text NOT NULL,
                    model_name text,
                    model_description text,
                    model_category text,
                    model_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
                    source_format text NOT NULL,
                    conversion_profile text,
                    status text NOT NULL,
                    visibility text NOT NULL DEFAULT 'public',
                    share_token text,
                    owner_user_id text,
                    created_by_user_id text,
                    updated_by_user_id text,
                    auth_provider text,
                    auth_subject text,
                    storage_key_original text,
                    storage_key_glb text,
                    storage_key_thumbnail_custom text,
                    checksum text,
                    size_bytes bigint,
                    conversion_ms integer,
                    created_at text,
                    updated_at text
                )
                """
            )
            cur.execute("ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'")
            cur.execute("ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS share_token text")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS approvals (
                    id bigserial PRIMARY KEY,
                    model_version_id text NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
                    decision text NOT NULL,
                    comment text,
                    created_by_user_id text,
                    created_at text
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_models (
                    id text PRIMARY KEY,
                    user_id text NOT NULL,
                    model_version_id text NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
                    saved_at text
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS categories (
                    id text PRIMARY KEY,
                    label text NOT NULL,
                    active boolean NOT NULL DEFAULT true,
                    sort_order integer NOT NULL DEFAULT 100,
                    created_at text
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_model_versions_owner ON model_versions(owner_user_id)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_model_versions_status_created "
                "ON model_versions(status, created_at DESC)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_model_versions_visibility_status "
                "ON model_versions(visibility, status, created_at DESC)"
            )
            cur.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_model_versions_share_token "
                "ON model_versions(share_token) WHERE share_token IS NOT NULL"
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_saved_models_user ON saved_models(user_id)")
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_saved_models_model ON saved_models(model_version_id)"
            )
            for index, label in enumerate(DEFAULT_CATEGORIES):
                cur.execute(
                    """
                    INSERT INTO categories (id, label, active, sort_order)
                    VALUES (%(id)s, %(label)s, true, %(sort_order)s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    {"id": _category_id(label), "label": label, "sort_order": index * 10},
                )


def create_model_version(record: dict[str, Any]) -> dict[str, Any]:
    columns_sql = ", ".join(MODEL_VERSION_COLUMNS)
    values_sql = ", ".join(f"%({column})s" for column in MODEL_VERSION_COLUMNS)
    update_sql = ", ".join(
        f"{column} = EXCLUDED.{column}" for column in MODEL_VERSION_COLUMNS if column != "id"
    )
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO model_versions ({columns_sql})
                VALUES ({values_sql})
                ON CONFLICT (id) DO UPDATE SET {update_sql}
                RETURNING *
                """,
                _model_params(record),
            )
            return _normalize_model_row(cur.fetchone()) or record


def get_model_version(model_version_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM model_versions WHERE id = %s", (model_version_id,))
            return _normalize_model_row(cur.fetchone())


def list_model_versions(
    owner_user_id: str | None = None,
    status: str | None = None,
    visibility: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    where: list[str] = []
    params: list[Any] = []
    if owner_user_id:
        where.append("owner_user_id = %s")
        params.append(owner_user_id)
    if status:
        where.append("status = %s")
        params.append(status)
    if visibility:
        where.append("visibility = %s")
        params.append(visibility)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([safe_limit, safe_offset])
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT * FROM model_versions
                {where_sql}
                ORDER BY created_at DESC NULLS LAST
                LIMIT %s OFFSET %s
                """,
                params,
            )
            return [_normalize_model_row(row) or row for row in cur.fetchall()]


def get_model_version_by_share_token(share_token: str) -> dict[str, Any] | None:
    token = share_token.strip()
    if not token:
        return None
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM model_versions WHERE share_token = %s", (token,))
            return _normalize_model_row(cur.fetchone())


def update_model_version(model_version_id: str, **updates: Any) -> dict[str, Any] | None:
    if not updates:
        return get_model_version(model_version_id)
    assignments: list[str] = []
    params: dict[str, Any] = {"id": model_version_id}
    for key, value in updates.items():
        if key not in MODEL_VERSION_COLUMNS or key == "id":
            continue
        assignments.append(f"{key} = %({key})s")
        params[key] = _jsonb(value) if key == "model_tags" else value
    if not assignments:
        return get_model_version(model_version_id)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE model_versions
                SET {', '.join(assignments)}
                WHERE id = %(id)s
                RETURNING *
                """,
                params,
            )
            return _normalize_model_row(cur.fetchone())


def delete_model_version(model_version_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM model_versions WHERE id = %s RETURNING *", (model_version_id,))
            return _normalize_model_row(cur.fetchone())


def add_approval(record: dict[str, Any]) -> dict[str, Any]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO approvals (
                    model_version_id,
                    decision,
                    comment,
                    created_by_user_id,
                    created_at
                )
                VALUES (
                    %(model_version_id)s,
                    %(decision)s,
                    %(comment)s,
                    %(created_by_user_id)s,
                    %(created_at)s
                )
                """,
                {
                    "model_version_id": record.get("model_version_id"),
                    "decision": record.get("decision"),
                    "comment": record.get("comment"),
                    "created_by_user_id": record.get("created_by_user_id"),
                    "created_at": record.get("created_at"),
                },
            )
    return record


def save_model_for_user(record: dict[str, Any]) -> dict[str, Any]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO saved_models (id, user_id, model_version_id, saved_at)
                VALUES (%(id)s, %(user_id)s, %(model_version_id)s, %(saved_at)s)
                ON CONFLICT (id) DO UPDATE SET saved_at = EXCLUDED.saved_at
                """,
                record,
            )
    return record


def unsave_model_for_user(user_id: str, model_version_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM saved_models
                WHERE id = %s
                RETURNING *
                """,
                (f"{user_id}:{model_version_id}",),
            )
            return cur.fetchone()


def list_saved_model_ids(user_id: str) -> list[str]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT model_version_id
                FROM saved_models
                WHERE user_id = %s
                ORDER BY saved_at DESC NULLS LAST
                """,
                (user_id,),
            )
            return [str(row["model_version_id"]) for row in cur.fetchall()]


def delete_saved_models_for_model(model_version_id: str) -> int:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM saved_models WHERE model_version_id = %s", (model_version_id,))
            return cur.rowcount


def delete_saved_models_for_user(user_id: str) -> int:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM saved_models WHERE user_id = %s", (user_id,))
            return cur.rowcount


def list_model_categories(active_only: bool = True) -> list[dict[str, Any]]:
    where_sql = "WHERE active = true" if active_only else ""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT * FROM categories
                {where_sql}
                ORDER BY sort_order ASC, label ASC
                """
            )
            return [_normalize_category_row(row) or row for row in cur.fetchall()]


def create_model_category(label: str) -> dict[str, Any]:
    category_id = _category_id(label)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO categories (id, label, active, sort_order)
                VALUES (
                    %(id)s,
                    %(label)s,
                    true,
                    (SELECT COALESCE(MAX(sort_order), -10) + 10 FROM categories)
                )
                ON CONFLICT (id) DO UPDATE SET
                    label = EXCLUDED.label,
                    active = true
                RETURNING *
                """,
                {"id": category_id, "label": label.strip()},
            )
            row = _normalize_category_row(cur.fetchone())
            if row is None:
                raise RuntimeError("Failed to create category")
            return row


def delete_model_category(category_id: str) -> dict[str, Any] | None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE categories
                SET active = false
                WHERE id = %s
                RETURNING *
                """,
                (category_id,),
            )
            return _normalize_category_row(cur.fetchone())


def update_model_category(
    category_id: str,
    *,
    label: str | None = None,
    sort_order: int | None = None,
) -> dict[str, Any] | None:
    updates: list[str] = []
    params: dict[str, Any] = {"id": category_id}
    if label is not None:
        updates.append("label = %(label)s")
        params["label"] = label.strip()
    if sort_order is not None:
        updates.append("sort_order = %(sort_order)s")
        params["sort_order"] = int(sort_order)
    if not updates:
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM categories WHERE id = %s", (category_id,))
                return _normalize_category_row(cur.fetchone())
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE categories
                SET {', '.join(updates)}
                WHERE id = %(id)s
                RETURNING *
                """,
                params,
            )
            return _normalize_category_row(cur.fetchone())
