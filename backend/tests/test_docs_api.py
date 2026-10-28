import unittest
from datetime import date
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.docs import SyncRequest, extract_document_id
from app.db.base import Base
from app.db.models import LogbookEntry
from app.db.session import get_db
from app.main import api, app


def cell(value: str) -> dict:
    return {"content": [{"paragraph": {"elements": [{"textRun": {"content": value + "\n"}}]}}]}


def google_document() -> dict:
    rows = [
        ["Tanggal", "Uraian Kegiatan"],
        ["19 Oktober 2026", "Menyusun kebutuhan"],
        ["20 Oktober 2026", "Meninjau rancangan"],
        ["21 Oktober 2026", ""],
    ]
    table = {"tableRows": [{"tableCells": [cell(value) for value in row]} for row in rows]}
    return {"body": {"content": [{"table": table}]}}


class GoogleDocsApiTests(unittest.TestCase):
    def test_extracts_document_id_from_url_or_id(self) -> None:
        self.assertEqual(
            extract_document_id("https://docs.google.com/document/d/abcdefghij_123/edit?usp=sharing"),
            "abcdefghij_123",
        )
        self.assertEqual(extract_document_id("abcdefghij_123"), "abcdefghij_123")

    def test_rejects_non_google_hosts_and_non_document_paths(self) -> None:
        for value in (
            "https://docs.google.com.evil.test/document/d/abcdefghij/edit",
            "https://drive.google.com/file/d/abcdefghij/view",
            "http://docs.google.com/document/d/abcdefghij/edit",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                extract_document_id(value)

    def test_rejects_a_reversed_date_range(self) -> None:
        with self.assertRaises(ValidationError):
            SyncRequest(
                document_url="abcdefghij_123",
                start_date=date(2026, 10, 22),
                end_date=date(2026, 10, 20),
            )

    def test_sync_reports_only_the_selected_date_range(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)

        def test_db():
            with Session(engine) as session:
                yield session

        api.dependency_overrides[get_db] = test_db
        try:
            with patch("app.api.docs.get_google_credentials", return_value=object()), patch(
                "app.api.docs.get_document", return_value=google_document()
            ), TestClient(app) as client:
                response = client.post(
                    "/api/docs/sync",
                    json={
                        "document_url": "abcdefghij_123",
                        "start_date": "2026-10-20",
                        "end_date": "2026-10-21",
                    },
                )

            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual([day["status"] for day in body["days"]], ["filled", "blank"])
            self.assertEqual(body["summary"]["filled"], 1)
            with Session(engine) as session:
                entries = list(session.scalars(select(LogbookEntry)))
                self.assertEqual(len(entries), 1)
                self.assertEqual(entries[0].date, date(2026, 10, 20))
        finally:
            api.dependency_overrides.pop(get_db, None)
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
