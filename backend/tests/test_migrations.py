import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.core.config import get_settings


class MigrationTests(unittest.TestCase):
    def test_initial_migration_creates_logbook_entries(self) -> None:
        backend = Path(__file__).resolve().parents[1]
        with TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "migration-test.sqlite3"
            database_url = f"sqlite:///{database_path.as_posix()}"
            try:
                with patch.dict(os.environ, {"DATABASE_URL": database_url}):
                    get_settings.cache_clear()
                    command.upgrade(Config(str(backend / "alembic.ini")), "head")
            finally:
                get_settings.cache_clear()

            engine = create_engine(database_url)
            try:
                inspector = inspect(engine)
                columns = {column["name"] for column in inspector.get_columns("logbook_entries")}
                self.assertTrue(
                    {
                        "date",
                        "original_activity",
                        "source_hash",
                        "source_payload_json",
                        "source_conflict",
                        "status",
                    }.issubset(columns)
                )
                self.assertTrue(
                    {"id", "start_date", "end_date", "runner", "status", "total_entries", "stop_requested", "pause_requested"}.issubset(
                        {column["name"] for column in inspector.get_columns("automation_runs")}
                    )
                )
                self.assertTrue(
                    {"id", "run_id", "entry_id", "status", "save_attempted", "safe_to_retry", "snapshot_json", "claimed_by", "lease_expires_at"}.issubset(
                        {column["name"] for column in inspector.get_columns("automation_run_entries")}
                    )
                )
                self.assertTrue(
                    {"extension_pairing_code_hash", "extension_pairing_expires_at", "extension_token_hash", "extension_token_created_at"}.issubset(
                        {column["name"] for column in inspector.get_columns("logbook_settings")}
                    )
                )
            finally:
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
