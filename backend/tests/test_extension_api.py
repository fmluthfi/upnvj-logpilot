import json
import unittest
from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.extension import (
    PairRequest,
    ReportRequest,
    SaveAttemptRequest,
    WorkerRequest,
    claim_next_entry,
    create_pairing_code,
    pair_extension,
    report_entry,
    mark_save_attempted,
    latest_job,
    retry_extension_job,
    unpair_extension,
)
from app.api.runs import Confirmation, StartRequest, control_extension_run, prepare_run, retry_failed
from app.db.base import Base
from app.db.models import AutomationRun, AutomationRunEntry, LogbookEntry, LogbookSettings


class ExtensionApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.entry = LogbookEntry(
            date=date(2026, 10, 1),
            activity_text="Membuat halaman fasilitas.",
            result_text="Halaman fasilitas tersedia.",
            obstacle_text="",
            start_time=time(9),
            end_time=time(17),
            documentation_url="https://drive.google.com/file/d/example/view",
            entry_approved=True,
            status="approved",
            source_conflict=False,
        )
        self.session.add(self.entry)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def pairing_code(self):
        result = create_pairing_code(
            self.request_from("http://localhost:3000"), self.session
        )
        return result["pairing_code"]

    @staticmethod
    def request_from(origin):
        return Request({
            "type": "http",
            "method": "POST",
            "path": "/api/extension/pairing-code",
            "headers": [(b"origin", origin.encode())],
        })

    def pair(self):
        return pair_extension(PairRequest(code=self.pairing_code()), self.session)["token"]

    def prepare(self):
        return prepare_run(
            StartRequest(start_date="2026-10-01", end_date="2026-10-01", confirmed=True),
            self.session,
        )

    def test_pairing_code_is_single_use_and_only_hashes_are_persisted(self):
        code = self.pairing_code()

        result = pair_extension(PairRequest(code=code), self.session)

        settings = self.session.get(LogbookSettings, "local")
        self.assertEqual(settings.extension_pairing_code_hash, None)
        self.assertEqual(settings.extension_token_hash, sha256(result["token"].encode()).hexdigest())
        self.assertNotEqual(settings.extension_token_hash, result["token"])
        with self.assertRaises(HTTPException) as error:
            pair_extension(PairRequest(code=code), self.session)
        self.assertEqual(error.exception.status_code, 401)

    def test_pairing_code_cannot_be_issued_from_another_origin(self):
        with self.assertRaises(HTTPException) as error:
            create_pairing_code(self.request_from("https://example.com"), self.session)
        self.assertEqual(error.exception.status_code, 403)

    def test_prepared_run_keeps_immutable_snapshot_after_source_edit(self):
        result = self.prepare()
        run = self.session.get(AutomationRun, result["id"])
        item = self.session.query(AutomationRunEntry).filter_by(run_id=run.id).one()
        snapshot = json.loads(item.snapshot_json)

        self.entry.activity_text = "Uraian sumber berubah setelah batch disiapkan."
        self.session.commit()

        self.assertEqual(run.runner, "extension")
        self.assertEqual(run.status, "ready")
        self.assertEqual(snapshot["activity_text"], "Membuat halaman fasilitas.")
        self.assertEqual(json.loads(item.snapshot_json), snapshot)

    def test_claim_returns_saved_snapshot_and_prevents_second_worker_claim(self):
        run = self.prepare()
        token = self.pair()

        claimed = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=f"Bearer {token}", session=self.session)
        second = claim_next_entry(WorkerRequest(worker_id="extension-b"), authorization=f"Bearer {token}", session=self.session)

        self.assertEqual(claimed["run_id"], run["id"])
        self.assertEqual(claimed["entry"]["activity_text"], "Membuat halaman fasilitas.")
        self.assertFalse(claimed["save_attempted"])
        self.assertIsNone(second)

    def test_repeated_claim_from_the_same_worker_recovers_the_active_entry(self):
        self.prepare()
        token = self.pair()
        request = WorkerRequest(worker_id="extension-a")

        first = claim_next_entry(request, authorization=f"Bearer {token}", session=self.session)
        recovered = claim_next_entry(request, authorization=f"Bearer {token}", session=self.session)

        self.assertEqual(first["run_entry_id"], recovered["run_entry_id"])

    def test_missing_extension_token_cannot_claim_a_batch(self):
        self.prepare()

        with self.assertRaises(HTTPException) as error:
            claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=None, session=self.session)

        self.assertEqual(error.exception.status_code, 401)

    def test_expired_claim_after_save_attempt_requires_manual_review(self):
        run = self.prepare()
        token = self.pair()
        claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=f"Bearer {token}", session=self.session)
        item = self.session.query(AutomationRunEntry).filter_by(run_id=run["id"]).one()
        item.save_attempted = True
        item.lease_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.session.commit()

        next_claim = claim_next_entry(WorkerRequest(worker_id="extension-b"), authorization=f"Bearer {token}", session=self.session)

        self.session.refresh(item)
        self.session.refresh(self.session.get(AutomationRun, run["id"]))
        self.assertIsNone(next_claim)
        self.assertEqual(item.status, "verification_needed")

    def test_expired_claim_before_save_is_safe_to_reclaim(self):
        run = self.prepare()
        token = self.pair()
        first = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=f"Bearer {token}", session=self.session)
        item = self.session.query(AutomationRunEntry).filter_by(run_id=run["id"]).one()
        item.lease_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.session.commit()

        second = claim_next_entry(WorkerRequest(worker_id="extension-b"), authorization=f"Bearer {token}", session=self.session)

        self.assertEqual(first["run_entry_id"], second["run_entry_id"])
        self.assertEqual(item.status, "processing")
        self.assertEqual(item.claimed_by, "extension-b")

    def test_expired_claim_after_stop_stays_stopped_and_releases_entry(self):
        run_payload = self.prepare()
        token = self.pair()
        authorization = f"Bearer {token}"
        claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)
        run = self.session.get(AutomationRun, run_payload["id"])
        item = self.session.query(AutomationRunEntry).filter_by(run_id=run.id).one()
        control_extension_run(self.session, run, "stop")
        item.lease_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.session.commit()

        claim_next_entry(WorkerRequest(worker_id="extension-b"), authorization=authorization, session=self.session)

        self.session.refresh(run)
        self.session.refresh(item)
        self.session.refresh(self.entry)
        self.assertEqual(run.status, "stopped")
        self.assertEqual(item.status, "stopped")
        self.assertTrue(item.safe_to_retry)
        self.assertEqual(self.entry.status, "approved")

    def test_recovered_worker_does_not_resume_a_paused_claim(self):
        run_payload = self.prepare()
        token = self.pair()
        authorization = f"Bearer {token}"
        first = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)
        run = self.session.get(AutomationRun, run_payload["id"])
        control_extension_run(self.session, run, "pause")

        recovered = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)

        self.session.refresh(run)
        item = self.session.query(AutomationRunEntry).filter_by(run_id=run.id).one()
        self.assertIsNone(recovered)
        self.assertEqual(item.status, "queued")
        self.assertIsNone(item.claimed_by)
        self.assertEqual(run.status, "paused")
        self.assertEqual(first["run_entry_id"], item.id)

    def test_success_report_requires_a_persisted_save_attempt(self):
        run = self.prepare()
        token = self.pair()
        authorization = f"Bearer {token}"
        claimed = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)

        with self.assertRaises(HTTPException) as error:
            report_entry(
                run["id"], claimed["run_entry_id"], ReportRequest(
                    worker_id="extension-a", outcome="success"
                ), authorization=authorization, session=self.session,
            )

        self.assertEqual(error.exception.status_code, 409)
        mark_save_attempted(
            run["id"], claimed["run_entry_id"], SaveAttemptRequest(worker_id="extension-a"), authorization=authorization, session=self.session
        )
        result = report_entry(
            run["id"], claimed["run_entry_id"], ReportRequest(
                worker_id="extension-a", outcome="success"
            ), authorization=authorization, session=self.session,
        )
        self.assertEqual(result["status"], "completed")

    def test_failed_extension_entry_cannot_retry_a_changed_snapshot(self):
        run = self.prepare()
        token = self.pair()
        authorization = f"Bearer {token}"
        claimed = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)
        report_entry(
            run["id"], claimed["run_entry_id"],
            ReportRequest(worker_id="extension-a", outcome="failed"),
            authorization=authorization, session=self.session,
        )
        self.entry.activity_text = "Uraian diubah setelah batch gagal."
        self.session.commit()

        with self.assertRaises(HTTPException) as error:
            retry_failed(run["id"], Confirmation(confirmed=True), self.session)

        self.assertEqual(error.exception.status_code, 409)

    def test_save_attempt_marker_is_one_shot(self):
        run = self.prepare()
        token = self.pair()
        authorization = f"Bearer {token}"
        claimed = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)
        request = SaveAttemptRequest(worker_id="extension-a")
        mark_save_attempted(run["id"], claimed["run_entry_id"], request, authorization=authorization, session=self.session)

        with self.assertRaises(HTTPException) as error:
            mark_save_attempted(run["id"], claimed["run_entry_id"], request, authorization=authorization, session=self.session)

        self.assertEqual(error.exception.status_code, 409)

    def test_pause_report_requeues_claim_without_marking_failure(self):
        run = self.prepare()
        token = self.pair()
        authorization = f"Bearer {token}"
        claim = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)

        result = report_entry(
            run["id"], claim["run_entry_id"],
            ReportRequest(worker_id="extension-a", outcome="paused"),
            authorization=authorization, session=self.session,
        )

        item = self.session.query(AutomationRunEntry).filter_by(run_id=run["id"]).one()
        self.session.refresh(self.entry)
        self.assertEqual(result["status"], "paused")
        self.assertEqual(item.status, "queued")
        self.assertIsNone(item.claimed_by)
        self.assertEqual(self.entry.status, "approved")

    def test_stop_report_releases_unsubmitted_entry_as_retryable(self):
        run = self.prepare()
        token = self.pair()
        authorization = f"Bearer {token}"
        claim = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)
        control_extension_run(self.session, self.session.get(AutomationRun, run["id"]), "stop")

        result = report_entry(
            run["id"], claim["run_entry_id"],
            ReportRequest(worker_id="extension-a", outcome="stopped"),
            authorization=authorization, session=self.session,
        )

        item = self.session.query(AutomationRunEntry).filter_by(run_id=run["id"]).one()
        self.session.refresh(self.entry)
        self.assertEqual(result["status"], "stopped")
        self.assertEqual(item.status, "stopped")
        self.assertTrue(item.safe_to_retry)
        self.assertEqual(self.entry.status, "approved")

    def test_latest_job_requires_pairing_and_returns_extension_batch(self):
        run = self.prepare()
        token = self.pair()

        result = latest_job(authorization=f"Bearer {token}", session=self.session)

        self.assertEqual(result["id"], run["id"])
        with self.assertRaises(HTTPException) as error:
            latest_job(authorization=None, session=self.session)
        self.assertEqual(error.exception.status_code, 401)

    def test_retry_extension_job_requires_pairing_and_uses_extension_runner(self):
        run = self.prepare()
        token = self.pair()
        authorization = f"Bearer {token}"
        claim = claim_next_entry(WorkerRequest(worker_id="extension-a"), authorization=authorization, session=self.session)
        report_entry(
            run["id"], claim["run_entry_id"],
            ReportRequest(worker_id="extension-a", outcome="failed"),
            authorization=authorization, session=self.session,
        )

        result = retry_extension_job(
            run["id"], Confirmation(confirmed=True), authorization=authorization, session=self.session,
        )

        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["counts"]["queued"], 1)
        with self.assertRaises(HTTPException) as error:
            retry_extension_job(run["id"], Confirmation(confirmed=True), authorization=None, session=self.session)
        self.assertEqual(error.exception.status_code, 401)

    def test_unpair_is_rejected_while_an_extension_batch_is_active(self):
        run = self.prepare()
        token = self.pair()

        with self.assertRaises(HTTPException) as error:
            unpair_extension(authorization=f"Bearer {token}", session=self.session)

        self.assertEqual(error.exception.status_code, 409)
        self.assertTrue(self.session.get(LogbookSettings, "local").extension_token_hash)


if __name__ == "__main__":
    unittest.main()
