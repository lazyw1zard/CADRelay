from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services import postgres_db


def _load_metadata(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Metadata file not found: {path}")
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _records(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        return [row for row in value.values() if isinstance(row, dict)]
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    return []


def migrate(path: Path) -> dict[str, int]:
    data = _load_metadata(path)
    postgres_db.init_metadata_store()

    model_count = 0
    for record in _records(data.get("model_versions", {})):
        postgres_db.create_model_version(record)
        model_count += 1

    saved_count = 0
    for record in _records(data.get("saved_models", {})):
        postgres_db.save_model_for_user(record)
        saved_count += 1

    approval_count = 0
    for record in _records(data.get("approvals", [])):
        if record.get("model_version_id"):
            postgres_db.add_approval(record)
            approval_count += 1

    category_count = 0
    for record in _records(data.get("categories", {})):
        label = str(record.get("label") or "").strip()
        if not label:
            continue
        category = postgres_db.create_model_category(label)
        postgres_db.update_model_category(
            category["id"],
            sort_order=int(record.get("sort_order") or category.get("sort_order") or 100),
        )
        if record.get("active", True) is False:
            postgres_db.delete_model_category(category["id"])
        category_count += 1

    return {
        "model_versions": model_count,
        "saved_models": saved_count,
        "approvals": approval_count,
        "categories": category_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate local MakeLayer metadata.json to Postgres.")
    parser.add_argument(
        "--metadata-file",
        type=Path,
        default=settings.metadata_file,
        help="Path to local metadata.json. Defaults to current CADRELAY_DATA_DIR metadata file.",
    )
    args = parser.parse_args()

    if not settings.postgres_dsn:
        raise RuntimeError("Set CADRELAY_POSTGRES_DSN or DATABASE_URL before running migration")

    result = migrate(args.metadata_file)
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
