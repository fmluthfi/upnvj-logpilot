import unittest
from io import BytesIO

from docx import Document
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models import LogbookEntry
from app.db.session import get_db
from app.main import api, app


def word_file() -> bytes:
    document = Document()
    table = document.add_table(rows=0, cols=2)
    for values in (("Tanggal", "Uraian Kegiatan"), ("21 Oktober 2026", "Menyusun kebutuhan")):
        cells = table.add_row().cells
        for cell, value in zip(cells, values):
            cell.text = value
    output = BytesIO()
    document.save(output)
    return output.getvalue()


class FileUploadApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)

        def test_db():
            with Session(self.engine) as session:
                yield session

        api.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        api.dependency_overrides.pop(get_db, None)
        self.engine.dispose()

    def upload(self, name: str, data: bytes, start="2026-10-21", end="2026-10-22"):
        return self.client.post(
            "/api/docs/upload",
            data={"start_date": start, "end_date": end},
            files={"file": (name, data)},
        )

    def test_upload_works_without_google_oauth_and_is_idempotent(self) -> None:
        data = word_file()
        first = self.upload("catatan.docx", data)
        second = self.upload("catatan.docx", data)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json()["summary"]["filled"], 1)
        self.assertEqual(first.json()["summary"]["missing"], 1)
        self.assertEqual(second.json()["sync"]["unchanged"], 1)
        with Session(self.engine) as session:
            entries = list(session.scalars(select(LogbookEntry)))
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0].original_activity, "Menyusun kebutuhan")

    def test_rejects_wrong_type_and_reversed_dates(self) -> None:
        self.assertEqual(self.upload("old.doc", b"not word").status_code, 422)
        self.assertEqual(self.upload("catatan.docx", word_file(), "2026-10-22", "2026-10-21").status_code, 422)


if __name__ == "__main__":
    unittest.main()
