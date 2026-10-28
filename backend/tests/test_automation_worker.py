import unittest
from datetime import date, time

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.automation.portal_adapter import PortalSafetyError, PortalSaveResult
from app.automation.worker import _portal_fields, execute_queued_entries
from app.db.base import Base
from app.db.models import AutomationRun, AutomationRunEntry, LogbookEntry, WeeklyReflection
from app.services.reflection_service import get_week_reflection


class AutomationWorkerTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def entry(self, day):
        entry = LogbookEntry(
            date=day,
            activity_text=f"Menyusun halaman untuk tanggal {day.day}.",
            result_text="Halaman tersedia untuk ditinjau.",
            obstacle_text="",
            start_time=time(9),
            end_time=time(17),
            documentation_url="https://drive.google.com/file/d/example/view",
            entry_approved=True,
            status="processing",
            source_conflict=False,
        )
        self.session.add(entry)
        self.session.flush()
        return entry

    def run_with_entries(self, entries):
        run = AutomationRun(start_date=entries[0].date, end_date=entries[-1].date, status="queued", total_entries=len(entries))
        self.session.add(run)
        self.session.flush()
        items = [AutomationRunEntry(run_id=run.id, entry_id=entry.id, status="queued") for entry in entries]
        self.session.add_all(items)
        self.session.commit()
        return run, items

    def test_ambiguous_save_pauses_and_never_processes_remaining_entries(self):
        first = self.entry(date(2026, 10, 1))
        second = self.entry(date(2026, 10, 2))
        run, items = self.run_with_entries([first, second])

        class AmbiguousAdapter:
            calls = 0

            def save_daily_entry(self, _fields, *, should_stop, on_save_attempted):
                self.calls += 1
                on_save_attempted()
                return PortalSaveResult("verification_needed")

        adapter = AmbiguousAdapter()
        execute_queued_entries(self.session, run.id, adapter, should_stop=lambda: False)

        self.session.refresh(run)
        self.session.refresh(items[0])
        self.session.refresh(items[1])
        self.session.refresh(first)
        self.session.refresh(second)
        self.assertEqual(adapter.calls, 1)
        self.assertEqual(run.status, "paused")
        self.assertEqual(items[0].status, "verification_needed")
        self.assertTrue(items[0].save_attempted)
        self.assertEqual(items[1].status, "stopped")
        self.assertEqual(second.status, "approved")

    def test_existing_entry_is_recorded_without_saving_again(self):
        entry = self.entry(date(2026, 10, 1))
        run, (item,) = self.run_with_entries([entry])

        class ExistingAdapter:
            def save_daily_entry(self, _fields, *, should_stop, on_save_attempted):
                return PortalSaveResult("already_present")

        execute_queued_entries(self.session, run.id, ExistingAdapter(), should_stop=lambda: False)

        self.session.refresh(run)
        self.session.refresh(item)
        self.session.refresh(entry)
        self.assertEqual(run.status, "completed")
        self.assertEqual(run.completed_entries, 1)
        self.assertEqual(item.status, "submitted")
        self.assertFalse(item.save_attempted)
        self.assertEqual(entry.status, "submitted")

    def test_friday_entry_uses_only_the_current_approved_weekly_reflection(self):
        entry = self.entry(date(2026, 10, 2))
        snapshot = get_week_reflection(self.session, entry.date)
        with self.assertRaises(PortalSafetyError):
            _portal_fields(self.session, entry)

        self.session.add(WeeklyReflection(
            friday_date=entry.date,
            source_hash=snapshot["source_hash"],
            reflection_text="Saya mempelajari penyusunan halaman.",
            approved=True,
        ))
        self.session.commit()

        self.assertEqual(_portal_fields(self.session, entry)["reflection_text"], "Saya mempelajari penyusunan halaman.")


if __name__ == "__main__":
    unittest.main()
