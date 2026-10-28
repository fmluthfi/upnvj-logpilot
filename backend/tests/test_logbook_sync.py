import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models import LogbookEntry
from app.services.google_docs_parser import parse_document
from app.services.logbook_sync import persist_source_rows


def cell(value: str) -> dict:
    return {"content": [{"paragraph": {"elements": [{"textRun": {"content": value + "\n"}}]}}]}


def source_document(activity: str, result: str = "Rangkuman") -> dict:
    rows = [
        ["Tanggal", "Uraian Kegiatan", "Hasil"],
        ["21 Oktober 2026", activity, result],
    ]
    table = {"tableRows": [{"tableCells": [cell(value) for value in row]} for row in rows]}
    return {"body": {"content": [{"table": table}]}}


def source_document_with_inserted_row() -> dict:
    rows = [
        ["Tanggal", "Uraian Kegiatan", "Hasil"],
        ["20 Oktober 2026", "Catatan baru", "Rancangan"],
        ["21 Oktober 2026", "Riset kebutuhan", "Rangkuman"],
    ]
    table = {"tableRows": [{"tableCells": [cell(value) for value in row]} for row in rows]}
    return {"body": {"content": [{"table": table}]}}


class LogbookSyncTests(unittest.TestCase):
    def test_sync_is_idempotent_and_flags_source_conflicts_without_overwriting_edits(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        try:
            with Session(engine) as session:
                initial = parse_document(source_document("Riset kebutuhan"))
                first = persist_source_rows(session, "doc-id", initial)
                self.assertEqual((first.created, first.updated, first.unchanged), (1, 0, 0))

                entry = session.scalar(select(LogbookEntry))
                self.assertIsNotNone(entry)
                entry.activity_text = "Catatan yang diedit pengguna"
                entry.entry_approved = True
                session.commit()

                repeated = persist_source_rows(session, "doc-id", initial)
                self.assertEqual((repeated.created, repeated.updated, repeated.unchanged), (0, 0, 1))

                changed = parse_document(source_document("Menyusun rancangan", "Rancangan baru"))
                update = persist_source_rows(session, "doc-id", changed)
                self.assertEqual((update.created, update.updated, update.unchanged), (0, 1, 0))
                self.assertEqual(len(update.conflicts), 1)
                self.assertEqual(update.conflict_count, 1)

                entry = session.scalar(select(LogbookEntry))
                self.assertEqual(entry.original_activity, "Menyusun rancangan")
                self.assertEqual(entry.activity_text, "Catatan yang diedit pengguna")
                self.assertFalse(entry.entry_approved)
                self.assertTrue(entry.source_conflict)
                self.assertEqual(entry.status, "needs_review")
                self.assertEqual(entry.result_text, "Rancangan baru")
        finally:
            engine.dispose()

    def test_reordered_rows_match_by_content_without_overwriting_edits(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        try:
            with Session(engine) as session:
                initial = parse_document(source_document("Riset kebutuhan"))
                persist_source_rows(session, "doc-id", initial)
                entry = session.scalar(select(LogbookEntry))
                entry.activity_text = "Catatan pengguna"
                session.commit()

                shifted = parse_document(source_document_with_inserted_row())
                result = persist_source_rows(session, "doc-id", shifted)

                self.assertEqual((result.created, result.unchanged, result.updated), (1, 1, 0))
                entries = list(session.scalars(select(LogbookEntry).order_by(LogbookEntry.date)))
                self.assertEqual(entries[1].source_row_index, 3)
                self.assertEqual(entries[1].activity_text, "Catatan pengguna")
                self.assertFalse(entries[1].source_conflict)
        finally:
            engine.dispose()

    def test_removed_source_row_is_preserved_but_marked_for_review(self) -> None:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        try:
            with Session(engine) as session:
                persist_source_rows(session, "doc-id", parse_document(source_document("Riset kebutuhan")))
                entry = session.scalar(select(LogbookEntry))
                entry.entry_approved = True
                session.commit()

                blank_source = source_document("")
                result = persist_source_rows(session, "doc-id", parse_document(blank_source))

                self.assertEqual(result.conflict_count, 1)
                self.assertTrue(entry.source_conflict)
                self.assertFalse(entry.entry_approved)
                self.assertEqual(entry.original_activity, "Riset kebutuhan")
                self.assertEqual(entry.status, "needs_review")
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
