from __future__ import annotations

import pytest

from app.core.config import settings
from app.services import postgres_db


def test_postgres_backend_requires_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "postgres_dsn", "")

    with pytest.raises(RuntimeError, match="CADRELAY_POSTGRES_DSN"):
        postgres_db.init_metadata_store()
