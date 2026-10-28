import unittest
from datetime import date, time
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.entries import EntryPatch, GenerateResultRequest, approve_entry, generate_entry_result, update_entry
from app.db.base import Base
from app.db.models import LogbookEntry
from app.services.automation_service import preview_automation


class LogbookEntryRevisionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def entry(self, **overrides):
        values = {
            "date": date(2026, 10, 1),
            "activity_text": "Uraian awal.",
            "result_text": "Hasil awal.",
            "obstacle_text": "",
            "start_time": time(9),
            "end_time": time(17),
            "documentation_url": "https://drive.google.com/file/d/example/view",
            "entry_approved": True,
            "status": "submitted",
            "portal_entry_id": "portal-entry-1",
            "source_conflict": False,
        }
        values.update(overrides)
        entry = LogbookEntry(**values)
        self.session.add(entry)
        self.session.commit()
        return entry

    def test_editing_submitted_entry_requires_reapproval_and_keeps_portal_identity(self):
        entry = self.entry()

        updated = update_entry(entry.id, EntryPatch(activity_text="Uraian revisi."), self.session)

        self.assertEqual(updated["status"], "draft")
        self.assertFalse(updated["entry_approved"])
        self.assertEqual(entry.portal_entry_id, "portal-entry-1")
        self.assertEqual(preview_automation(self.session, entry.date, entry.date)["ready_count"], 0)
        approved = approve_entry(entry.id, self.session)
        preview = preview_automation(self.session, entry.date, entry.date)
        self.assertEqual(approved["status"], "approved")
        self.assertTrue(approved["entry_approved"])
        self.assertEqual(preview["ready_count"], 1)

    def test_submitted_entry_can_generate_result_for_a_revised_activity(self):
        entry = self.entry()
        with patch("app.api.entries.generate_result_draft", return_value="Hasil baru."):
            result = generate_entry_result(entry.id, GenerateResultRequest(activity_text="Uraian revisi."), self.session)
        self.assertEqual(result["result_text"], "Hasil baru.")

    def test_active_or_uncertain_entries_remain_locked(self):
        processing = self.entry(status="processing", portal_entry_id=None)
        with self.assertRaises(HTTPException) as error:
            update_entry(processing.id, EntryPatch(activity_text="Tidak boleh diedit saat proses."), self.session)
        self.assertEqual(error.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
