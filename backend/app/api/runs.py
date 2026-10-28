import os
import subprocess
import sys
from threading import Lock
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AutomationRun, AutomationRunEntry, LogbookEntry
from app.db.session import get_db
from app.services.automation_service import preview_automation


router = APIRouter(prefix="/runs", tags=["Portal automation"])
ACTIVE_STATUSES = {"queued", "waiting_login", "running", "stopping"}
# shortcut: the local launcher uses one Uvicorn worker; use a database lease if multi-worker hosting is added.
_RUN_LOCK = Lock()


class DateRange(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_range(self):
        if self.start_date > self.end_date:
            raise ValueError("Tanggal mulai harus sama dengan atau sebelum tanggal akhir.")
        return self


class StartRequest(DateRange):
    confirmed: bool


class Confirmation(BaseModel):
    confirmed: bool


class ResolveRequest(BaseModel):
    portal_checked: bool
    outcome: Literal["saved", "not_found"]


@router.post("/preview")
def preview_run(request: DateRange, session: Session = Depends(get_db)) -> dict:
    return preview_automation(session, request.start_date, request.end_date)


@router.post("/start", status_code=201)
def start_run(request: StartRequest, session: Session = Depends(get_db)) -> dict:
    with _RUN_LOCK:
        return _start_run(request, session)


def _start_run(request: StartRequest, session: Session) -> dict:
    if not request.confirmed:
        raise HTTPException(status_code=422, detail="Konfirmasi sebelum mulai automation.")
    _require_no_active_run(session)
    preview = preview_automation(session, request.start_date, request.end_date)
    if not preview["ready"]:
        raise HTTPException(status_code=409, detail="Tidak ada entri yang siap. Tinjau catatan yang terhalang terlebih dahulu.")

    entries = list(session.scalars(
        select(LogbookEntry)
        .where(LogbookEntry.id.in_([item["entry_id"] for item in preview["ready"]]))
        .order_by(LogbookEntry.date, LogbookEntry.created_at, LogbookEntry.id)
    ))
    run = AutomationRun(start_date=request.start_date, end_date=request.end_date, total_entries=len(entries))
    session.add(run)
    session.flush()
    for entry in entries:
        entry.status = "processing"
        entry.last_error = None
        session.add(AutomationRunEntry(run_id=run.id, entry_id=entry.id, status="queued"))
    session.commit()
    try:
        _spawn_worker(run.id)
    except OSError as error:
        _restore_unstarted_run(session, run, "Browser automation belum dapat dimulai. Periksa instalasi, lalu coba lagi.")
        raise HTTPException(status_code=503, detail="Browser automation belum dapat dimulai. Periksa instalasi, lalu coba lagi.") from error
    return _run_payload(session, run)


@router.get("/latest")
def latest_run(session: Session = Depends(get_db)) -> dict | None:
    run = session.scalar(select(AutomationRun).order_by(AutomationRun.created_at.desc(), AutomationRun.id.desc()).limit(1))
    return _run_payload(session, run) if run else None


@router.get("/{run_id}")
def read_run(run_id: str, session: Session = Depends(get_db)) -> dict:
    return _run_payload(session, _get_run(session, run_id))


@router.post("/{run_id}/stop")
def stop_run(run_id: str, session: Session = Depends(get_db)) -> dict:
    run = _get_run(session, run_id)
    if run.status not in ACTIVE_STATUSES:
        raise HTTPException(status_code=409, detail="Automation ini tidak sedang berjalan.")
    run.stop_requested = True
    run.status = "stopping"
    session.commit()
    return _run_payload(session, run)


@router.post("/{run_id}/entries/{run_entry_id}/resolve")
def resolve_entry(
    run_id: str,
    run_entry_id: str,
    request: ResolveRequest,
    session: Session = Depends(get_db),
) -> dict:
    if not request.portal_checked:
        raise HTTPException(status_code=422, detail="Periksa tanggal entri di portal sebelum memilih hasil.")
    run = _get_run(session, run_id)
    item = session.scalar(select(AutomationRunEntry).where(
        AutomationRunEntry.id == run_entry_id,
        AutomationRunEntry.run_id == run_id,
    ))
    if not item or item.status != "verification_needed":
        raise HTTPException(status_code=409, detail="Entri ini tidak sedang menunggu pemeriksaan portal.")
    if not item.save_attempted:
        raise HTTPException(status_code=409, detail="Tidak ada upaya Simpan yang perlu diverifikasi.")
    entry = session.get(LogbookEntry, item.entry_id)
    if entry is None:
        raise HTTPException(status_code=409, detail="Catatan lokal tidak lagi tersedia.")

    if request.outcome == "saved":
        item.status = "submitted"
        item.last_error = None
        entry.status = "submitted"
        entry.last_submitted_at = datetime.now(timezone.utc)
        entry.last_error = None
        run.completed_entries += 1
    else:
        item.status = "failed"
        item.safe_to_retry = True
        item.last_error = "Portal sudah diperiksa dan entri tidak ditemukan. Entri siap dicoba ulang."
        entry.status = "approved"
        entry.last_error = item.last_error
    session.commit()
    return _run_payload(session, run)


@router.post("/{run_id}/retry-failed")
def retry_failed(run_id: str, request: Confirmation, session: Session = Depends(get_db)) -> dict:
    with _RUN_LOCK:
        return _retry_failed(run_id, request, session)


def _retry_failed(run_id: str, request: Confirmation, session: Session) -> dict:
    if not request.confirmed:
        raise HTTPException(status_code=422, detail="Konfirmasi sebelum mencoba ulang entri.")
    run = _get_run(session, run_id)
    _require_no_active_run(session)
    candidates = list(session.scalars(select(AutomationRunEntry).where(
        AutomationRunEntry.run_id == run_id,
        AutomationRunEntry.status.in_({"failed", "stopped"}),
    )))
    candidates = [
        item for item in candidates
        if (not item.save_attempted or item.safe_to_retry)
        and (entry := session.get(LogbookEntry, item.entry_id)) is not None
        and entry.entry_approved
        and not entry.source_conflict
    ]
    if not candidates:
        raise HTTPException(status_code=409, detail="Tidak ada entri gagal yang aman untuk dicoba ulang.")

    for item in candidates:
        entry = session.get(LogbookEntry, item.entry_id)
        item.status = "queued"
        item.last_error = None
        item.retry_count += 1
        item.save_attempted = False
        item.safe_to_retry = False
        entry.status = "processing"
        entry.last_error = None
    run.status = "queued"
    run.stop_requested = False
    run.last_error = None
    session.commit()
    try:
        _spawn_worker(run.id)
    except OSError as error:
        _restore_unstarted_run(session, run, "Browser automation belum dapat dimulai. Entri tetap disetujui dan aman untuk dicoba ulang.")
        raise HTTPException(status_code=503, detail="Browser automation belum dapat dimulai. Entri tetap disetujui dan aman untuk dicoba ulang.") from error
    return _run_payload(session, run)


def _spawn_worker(run_id: str) -> None:
    backend = Path(__file__).resolve().parents[2]
    options = {
        "cwd": backend,
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "close_fds": True,
    }
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NO_WINDOW
    else:
        options["start_new_session"] = True
    subprocess.Popen([sys.executable, "-m", "app.automation.worker", run_id], **options)


def _require_no_active_run(session: Session) -> None:
    active = session.scalar(select(AutomationRun.id).where(AutomationRun.status.in_(ACTIVE_STATUSES)).limit(1))
    if active:
        raise HTTPException(status_code=409, detail="Automation lain masih berjalan. Hentikan atau tunggu sampai selesai.")


def _get_run(session: Session, run_id: str) -> AutomationRun:
    run = session.get(AutomationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Riwayat automation tidak ditemukan.")
    return run


def _restore_unstarted_run(session: Session, run: AutomationRun, message: str) -> None:
    run.status = "failed"
    run.last_error = message
    for item in session.scalars(select(AutomationRunEntry).where(
        AutomationRunEntry.run_id == run.id,
        AutomationRunEntry.status.in_({"queued", "processing"}),
    )):
        item.status = "failed"
        item.safe_to_retry = True
        item.last_error = message
        entry = session.get(LogbookEntry, item.entry_id)
        if entry:
            entry.status = "approved"
            entry.last_error = message
    session.commit()


def _run_payload(session: Session, run: AutomationRun | None) -> dict | None:
    if run is None:
        return None
    items = list(session.scalars(
        select(AutomationRunEntry).where(AutomationRunEntry.run_id == run.id).order_by(AutomationRunEntry.created_at, AutomationRunEntry.id)
    ))
    counts = {status: sum(item.status == status for item in items) for status in ("queued", "processing", "submitted", "failed", "stopped", "verification_needed")}
    return {
        "id": run.id,
        "start_date": run.start_date.isoformat(),
        "end_date": run.end_date.isoformat(),
        "status": run.status,
        "total_entries": run.total_entries,
        "completed_entries": run.completed_entries,
        "stop_requested": run.stop_requested,
        "last_error": run.last_error,
        "counts": counts,
        "entries": [
            {"id": item.id, "date": session.get(LogbookEntry, item.entry_id).date.isoformat(), "status": item.status, "last_error": item.last_error, "safe_to_retry": item.safe_to_retry}
            for item in items
        ],
    }
