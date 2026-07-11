"""Alembic migrations must produce exactly the schema the models describe.

The rest of the suite builds its schema with `Base.metadata.create_all()`, so
model/migration drift would go unnoticed — yet prod deploys run
`alembic upgrade head`. This runs the real migrations against a throwaway SQLite
file and diffs the result against `Base.metadata`; any diff is drift.
"""
import tempfile
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.command import upgrade
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

import app.models  # noqa: F401  — registers every table on Base.metadata
from app.core.config import get_settings
from app.db.session import Base

BACKEND_DIR = Path(__file__).resolve().parent.parent


def test_migrations_match_models(monkeypatch) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_url = f"sqlite:///{Path(tmp) / 'migrations_test.db'}"

        # env.py builds its engine from get_settings().database_url, so point that
        # at the throwaway file (never the dev/CI database) for this run.
        monkeypatch.setenv("DATABASE_URL", db_url)
        get_settings.cache_clear()

        cfg = Config(str(BACKEND_DIR / "alembic.ini"))
        cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
        try:
            upgrade(cfg, "head")

            engine = create_engine(db_url)
            try:
                with engine.connect() as conn:
                    ctx = MigrationContext.configure(
                        conn,
                        # compare_type off: SQLite type affinity produces benign
                        # noise (VARCHAR vs String) that isn't real drift.
                        opts={"compare_type": False, "render_as_batch": True},
                    )
                    diff = compare_metadata(ctx, Base.metadata)
            finally:
                engine.dispose()
        finally:
            get_settings.cache_clear()

    assert diff == [], f"Model/migration drift detected: {diff}"
