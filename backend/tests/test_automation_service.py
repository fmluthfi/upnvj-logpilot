import unittest
from datetime import date, time

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.models import LogbookEntry, WeeklyReflection
from app.services.automation_service import preview_automation
from app.services.reflection_service import get_week_reflection


class AutomationPreviewTests(unittest.TestCase):
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
            "activity_text": "Membuat halaman fasilitas.",
            "result_text": "Halaman fasilitas tersedia.",
            "obstacle_text": "",
            "start_time": time(9),
            "end_time": time(17),
            "documentation_url": "https://drive.google.com/file/d/example/view",
            "entry_approved": True,
            "status": "approved",
            "source_conflict": False,
        }
        values.update(overrides)
        entry = LogbookEntry(**values)
        self.session.add(entry)
        self.session.commit()
        return entry

    def test_inclusive_range_returns_only_approved_complete_entries(self):
        ready = self.entry(date=date(2026, 10, 1))
        self.entry(date=date(2026, 10, 2), status="draft", entry_approved=False)
        self.entry(date=date(2026, 10, 3))

        result = preview_automation(self.session, date(2026, 10, 1), date(2026, 10, 2))

        self.assertEqual(result["ready_count"], 1)
        self.assertEqual(result["ready"][0]["entry_id"], ready.id)
        self.assertEqual(result["blocked"][0]["date"], "2026-10-02")
        self.assertNotIn("activity_text", result["ready"][0])

    def test_missing_result_documentation_or_source_review_blocks_entry(self):
        self.entry(result_text="", documentation_url="", source_conflict=True)

        result = preview_automation(self.session, date(2026, 10, 1), date(2026, 10, 1))

        self.assertEqual(result["ready_count"], 0)
        self.assertGreaterEqual(len(result["blocked"][0]["reasons"]), 3)

    def test_friday_requires_a_current_approved_weekly_reflection(self):
        friday = date(2026, 10, 2)
        entry = self.entry(date=friday)

        blocked = preview_automation(self.session, friday, friday)
        self.assertEqual(blocked["ready_count"], 0)

        snapshot = get_week_reflection(self.session, friday)
        self.session.add(WeeklyReflection(
            friday_date=friday,
            source_hash=snapshot["source_hash"],
            reflection_text="Saya mempelajari penyusunan halaman.",
            approved=True,
        ))
        self.session.commit()

        ready = preview_automation(self.session, friday, friday)
        self.assertEqual(ready["ready_count"], 1)
        self.assertEqual(ready["ready"][0]["entry_id"], entry.id)
        self.assertNotIn("reflection_text", ready["ready"][0])

    def test_duplicate_same_day_activity_is_blocked(self):
        self.entry()
        self.entry()

        result = preview_automation(self.session, date(2026, 10, 1), date(2026, 10, 1))

        self.assertEqual(result["ready_count"], 0)
        self.assertEqual(len(result["blocked"]), 2)
        self.assertTrue(all("duplikat" in reason.casefold() for item in result["blocked"] for reason in item["reasons"]))


if __name__ == "__main__":
    unittest.main()
