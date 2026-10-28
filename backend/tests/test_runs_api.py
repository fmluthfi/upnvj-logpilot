import unittest
from datetime import date, time
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.runs import (
    Confirmation,
    ResolveRequest,
    StartRequest,
    resolve_entry,
    retry_failed,
    start_run,
    stop_run,
)
from app.db.base import Base
from app.db.models import AutomationRun, AutomationRunEntry, LogbookEntry


class AutomationRunApiTests(unittest.TestCase):
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

    def payload(self, **overrides):
        return StartRequest(
            start_date=overrides.get("start_date", "2026-10-01"),
            end_date=overrides.get("end_date", "2026-10-03"),
            confirmed=overrides.get("confirmed", True),
        )

    def test_start_requires_explicit_confirmation(self):
        self.entry()

        with self.assertRaises(HTTPException) as error:
            start_run(self.payload(confirmed=False), self.session)

        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(self.session.query(AutomationRun).count(), 0)

    def test_start_queues_only_ready_entries_and_launches_worker(self):
        approved = self.entry()
        unapproved = self.entry(date=date(2026, 10, 2), status="draft", entry_approved=False)

        with patch("app.api.runs._spawn_worker") as spawn_worker:
            result = start_run(self.payload(), self.session)

        run = self.session.get(AutomationRun, result["id"])
        items = self.session.query(AutomationRunEntry).filter_by(run_id=result["id"]).all()
        self.assertEqual(run.total_entries, 1)
        self.assertEqual([item.entry_id for item in items], [approved.id])
        self.assertEqual(approved.status, "processing")
        self.assertEqual(unapproved.status, "draft")
        spawn_worker.assert_called_once_with(run.id)
        with self.assertRaises(HTTPException) as error:
            start_run(self.payload(), self.session)
        self.assertEqual(error.exception.status_code, 409)

    def test_failed_worker_launch_returns_entries_to_approved(self):
        entry = self.entry()

        with patch("app.api.runs._spawn_worker", side_effect=OSError("spawn failed")):
            with self.assertRaises(HTTPException) as error:
                start_run(self.payload(end_date="2026-10-01"), self.session)

        self.assertEqual(error.exception.status_code, 503)
        self.session.refresh(entry)
        self.assertEqual(entry.status, "approved")
        self.assertEqual(self.session.query(AutomationRun).one().status, "failed")

    def test_stop_only_requests_worker_stop(self):
        run = AutomationRun(start_date=date(2026, 10, 1), end_date=date(2026, 10, 1), status="running")
        self.session.add(run)
        self.session.commit()

        stop_run(run.id, self.session)
        self.session.refresh(run)
        self.assertTrue(run.stop_requested)
        self.assertEqual(run.status, "stopping")

    def test_ambiguous_save_requires_portal_check_before_retry(self):
        entry = self.entry(status="verification_needed")
        run = AutomationRun(start_date=entry.date, end_date=entry.date, status="paused", total_entries=1)
        self.session.add(run)
        self.session.flush()
        item = AutomationRunEntry(run_id=run.id, entry_id=entry.id, status="verification_needed", save_attempted=True)
        self.session.add(item)
        self.session.commit()

        with self.assertRaises(HTTPException) as error:
            resolve_entry(run.id, item.id, ResolveRequest(portal_checked=False, outcome="not_found"), self.session)
        self.assertEqual(error.exception.status_code, 422)
        with self.assertRaises(HTTPException) as error:
            retry_failed(run.id, Confirmation(confirmed=True), self.session)
        self.assertEqual(error.exception.status_code, 409)

        resolve_entry(run.id, item.id, ResolveRequest(portal_checked=True, outcome="not_found"), self.session)
        self.session.refresh(item)
        self.assertTrue(item.safe_to_retry)
        self.assertEqual(item.status, "failed")

        with patch("app.api.runs._spawn_worker") as spawn_worker:
            retry_failed(run.id, Confirmation(confirmed=True), self.session)
        self.session.refresh(item)
        self.assertEqual(item.status, "queued")
        self.assertEqual(item.retry_count, 1)
        spawn_worker.assert_called_once_with(run.id)


if __name__ == "__main__":
    unittest.main()
