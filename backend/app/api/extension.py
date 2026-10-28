import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.runs import ACTIVE_STATUSES, Confirmation, _RUN_LOCK, _get_run, _refresh_extension_run, _retry_failed, _run_payload, control_extension_run
from app.db.models import AutomationRun, AutomationRunEntry, LogbookEntry, LogbookSettings
from app.db.session import get_db


router = APIRouter(prefix="/extension", tags=["Chrome extension"])
DASHBOARD_ORIGINS = {"http://localhost:3000", "http://127.0.0.1:3000"}
PAIRING_TTL = timedelta(minutes=5)
CLAIM_TTL = timedelta(minutes=2)


class PairRequest(BaseModel):
    code: str = Field(min_length=32, max_length=128)


class WorkerRequest(BaseModel):
    worker_id: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


class SaveAttemptRequest(WorkerRequest):
    pass


class ReportRequest(WorkerRequest):
    outcome: Literal["success", "failed", "skipped", "unknown", "already_present", "paused", "stopped"]
    error: str | None = Field(default=None, max_length=1000)


class ControlRequest(BaseModel):
    action: Literal["pause", "resume", "stop"]


@router.post("/pairing-code")
def create_pairing_code(request: Request, session: Session = Depends(get_db)) -> dict:
    with _RUN_LOCK:
        return _create_pairing_code(request, session)


def _create_pairing_code(request: Request, session: Session) -> dict:
    if request.headers.get("origin") not in DASHBOARD_ORIGINS:
        raise HTTPException(status_code=403, detail="Kode pairing hanya dapat dibuat dari dashboard lokal.")
    settings = _local_settings(session)
    if settings.extension_token_hash:
        raise HTTPException(status_code=409, detail="Extension sudah terhubung. Putuskan sambungan sebelum pairing ulang.")
    code = secrets.token_urlsafe(24)
    expires = _utcnow() + PAIRING_TTL
    settings.extension_pairing_code_hash = _digest(code)
    settings.extension_pairing_expires_at = expires
    session.commit()
    return {"pairing_code": code, "expires_at": expires.isoformat()}


@router.post("/pair")
def pair_extension(request: PairRequest, session: Session = Depends(get_db)) -> dict:
    with _RUN_LOCK:
        return _pair_extension(request, session)


def _pair_extension(request: PairRequest, session: Session) -> dict:
    settings = session.get(LogbookSettings, "local")
    expires = _as_utc(settings.extension_pairing_expires_at) if settings and settings.extension_pairing_expires_at else None
    if (
        settings is None
        or settings.extension_token_hash
        or not settings.extension_pairing_code_hash
        or expires is None
        or expires <= _utcnow()
        or not hmac.compare_digest(settings.extension_pairing_code_hash, _digest(request.code))
    ):
        raise HTTPException(status_code=401, detail="Kode pairing tidak valid atau sudah kedaluwarsa.")

    token = secrets.token_urlsafe(32)
    settings.extension_token_hash = _digest(token)
    settings.extension_token_created_at = _utcnow()
    settings.extension_pairing_code_hash = None
    settings.extension_pairing_expires_at = None
    session.commit()
    return {"token": token}


@router.get("/pairing-status")
def pairing_status(session: Session = Depends(get_db)) -> dict:
    settings = session.get(LogbookSettings, "local")
    return {
        "paired": bool(settings and settings.extension_token_hash),
        "paired_at": settings.extension_token_created_at.isoformat() if settings and settings.extension_token_created_at else None,
    }


@router.delete("/pair")
def unpair_extension(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict:
    with _RUN_LOCK:
        return _unpair_extension(authorization, session)


def _unpair_extension(authorization: str | None, session: Session) -> dict:
    settings = _authenticate(session, authorization)
    active_run = session.scalar(select(AutomationRun.id).where(
        AutomationRun.runner == "extension",
        AutomationRun.status.in_(ACTIVE_STATUSES),
    ).limit(1))
    if active_run:
        raise HTTPException(status_code=409, detail="Hentikan atau selesaikan batch extension sebelum memutuskan pairing.")
    settings.extension_token_hash = None
    settings.extension_token_created_at = None
    settings.extension_pairing_code_hash = None
    settings.extension_pairing_expires_at = None
    session.commit()
    return {"paired": False}


@router.get("/status")
def extension_status(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict:
    settings = _authenticate(session, authorization)
    return {"paired": True, "paired_at": settings.extension_token_created_at.isoformat() if settings.extension_token_created_at else None}


@router.get("/jobs/latest")
def latest_job(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict | None:
    _authenticate(session, authorization)
    run = session.scalar(select(AutomationRun).where(
        AutomationRun.runner == "extension",
    ).order_by(AutomationRun.created_at.desc(), AutomationRun.id.desc()).limit(1))
    return _run_payload(session, run) if run else None


@router.get("/jobs/{run_id}")
def read_job(
    run_id: str,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict:
    _authenticate(session, authorization)
    run = _get_run(session, run_id)
    if run.runner != "extension":
        raise HTTPException(status_code=409, detail="Run ini bukan batch extension.")
    return _run_payload(session, run)


@router.post("/jobs/claim")
def claim_next_entry(
    request: WorkerRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict | None:
    with _RUN_LOCK:
        _authenticate(session, authorization)
        return _claim_next_entry(request, session)


@router.post("/jobs/{run_id}/entries/{run_entry_id}/heartbeat")
def heartbeat_entry(
    run_id: str,
    run_entry_id: str,
    request: WorkerRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict:
    with _RUN_LOCK:
        return _heartbeat_entry(run_id, run_entry_id, request, authorization, session)


def _heartbeat_entry(run_id: str, run_entry_id: str, request: WorkerRequest, authorization: str | None, session: Session) -> dict:
    _authenticate(session, authorization)
    run, item = _owned_claim(session, run_id, run_entry_id, request.worker_id)
    if item.lease_expires_at is None or _as_utc(item.lease_expires_at) <= _utcnow():
        raise HTTPException(status_code=409, detail="Lease entri sudah berakhir. Periksa hasil di portal sebelum melanjutkan.")
    item.lease_expires_at = _utcnow() + CLAIM_TTL
    session.commit()
    return {"run_status": run.status, "pause_requested": run.pause_requested, "stop_requested": run.stop_requested, "lease_expires_at": item.lease_expires_at.isoformat()}


@router.post("/jobs/{run_id}/entries/{run_entry_id}/save-attempted")
def mark_save_attempted(
    run_id: str,
    run_entry_id: str,
    request: SaveAttemptRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict:
    with _RUN_LOCK:
        return _mark_save_attempted(run_id, run_entry_id, request, authorization, session)


def _mark_save_attempted(run_id: str, run_entry_id: str, request: SaveAttemptRequest, authorization: str | None, session: Session) -> dict:
    _authenticate(session, authorization)
    run, item = _owned_claim(session, run_id, run_entry_id, request.worker_id)
    if item.save_attempted:
        raise HTTPException(status_code=409, detail="Upaya Simpan sudah dicatat. Periksa portal sebelum mencoba lagi.")
    if run.pause_requested or run.stop_requested:
        raise HTTPException(status_code=409, detail="Batch sedang dijeda atau dihentikan; tombol Simpan tidak boleh ditekan.")
    if item.lease_expires_at is None or _as_utc(item.lease_expires_at) <= _utcnow():
        raise HTTPException(status_code=409, detail="Lease entri sudah berakhir; tombol Simpan tidak boleh ditekan.")
    item.save_attempted = True
    session.commit()
    return {"save_attempted": True}


@router.post("/jobs/{run_id}/entries/{run_entry_id}/report")
def report_entry(
    run_id: str,
    run_entry_id: str,
    request: ReportRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict:
    with _RUN_LOCK:
        return _report_entry(run_id, run_entry_id, request, authorization, session)


def _report_entry(run_id: str, run_entry_id: str, request: ReportRequest, authorization: str | None, session: Session) -> dict:
    _authenticate(session, authorization)
    run = _get_run(session, run_id)
    item = session.scalar(select(AutomationRunEntry).where(
        AutomationRunEntry.id == run_entry_id,
        AutomationRunEntry.run_id == run_id,
    ))
    if item is None:
        raise HTTPException(status_code=404, detail="Entri batch tidak ditemukan.")
    if item.status in {"submitted", "failed", "skipped", "stopped", "verification_needed"} or (
        item.status == "queued" and request.outcome == "paused"
    ):
        if _same_outcome(item.status, request.outcome):
            return _run_payload(session, run)
        raise HTTPException(status_code=409, detail="Hasil entri sudah tercatat dan tidak dapat diganti.")
    if item.status != "processing" or item.claimed_by != request.worker_id:
        raise HTTPException(status_code=409, detail="Entri tidak sedang diklaim oleh extension ini.")

    entry = session.get(LogbookEntry, item.entry_id)
    if entry is None:
        raise HTTPException(status_code=409, detail="Catatan sumber tidak lagi tersedia.")
    expired = item.lease_expires_at is None or _as_utc(item.lease_expires_at) <= _utcnow()
    if expired and item.save_attempted:
        _mark_verification_needed(session, run, item, entry, "Lease berakhir setelah upaya Simpan. Periksa portal sebelum mencoba ulang.")
        session.commit()
        return _run_payload(session, run)
    if expired:
        raise HTTPException(status_code=409, detail="Lease entri sudah berakhir. Klaim ulang entri sebelum melaporkan hasil.")

    if request.outcome == "success":
        if not item.save_attempted:
            raise HTTPException(status_code=409, detail="Simpan belum tercatat sebelum hasil sukses dilaporkan.")
        item.status = "submitted"
        entry.status = "submitted"
        entry.last_submitted_at = _utcnow()
        entry.last_error = None
        run.completed_entries += 1
    elif request.outcome == "already_present":
        if item.save_attempted:
            _mark_verification_needed(session, run, item, entry, "Entri ditemukan setelah upaya Simpan. Periksa portal sebelum melanjutkan.")
            session.commit()
            return _run_payload(session, run)
        item.status = "submitted"
        entry.status = "submitted"
        entry.last_submitted_at = _utcnow()
        entry.last_error = None
        run.completed_entries += 1
    elif request.outcome == "skipped" and not item.save_attempted:
        item.status = "skipped"
        item.safe_to_retry = False
        item.last_error = request.error or "Entri dilewati dan perlu ditinjau sebelum disiapkan ulang."
        entry.status = "needs_review"
        entry.entry_approved = False
        entry.last_error = item.last_error
    elif request.outcome == "paused" and not item.save_attempted:
        item.status = "queued"
        item.last_error = None
        entry.status = "approved"
        run.pause_requested = True
    elif request.outcome == "stopped" and not item.save_attempted:
        item.status = "stopped"
        item.safe_to_retry = True
        item.last_error = "Batch dihentikan sebelum upaya Simpan."
        entry.status = "approved"
        entry.last_error = item.last_error
        run.stop_requested = True
        run.pause_requested = False
    elif request.outcome == "failed" and not item.save_attempted:
        item.status = "failed"
        item.safe_to_retry = True
        item.last_error = request.error or "Langkah portal gagal sebelum Simpan. Entri aman untuk ditinjau dan dicoba ulang."
        entry.status = "approved"
        entry.last_error = item.last_error
    elif request.outcome == "unknown" and not item.save_attempted:
        item.status = "failed"
        item.safe_to_retry = True
        item.last_error = request.error or "Automation berhenti sebelum Simpan. Entri aman untuk ditinjau dan dicoba ulang."
        entry.status = "approved"
        entry.last_error = item.last_error
    elif request.outcome in {"failed", "unknown", "skipped", "paused", "stopped"}:
        _mark_verification_needed(session, run, item, entry, request.error or "Hasil Simpan belum dapat dipastikan. Periksa portal sebelum mencoba ulang.")

    item.claimed_by = None
    item.lease_expires_at = None
    _refresh_extension_run(session, run)
    session.commit()
    return _run_payload(session, run)


@router.post("/jobs/{run_id}/control")
def control_job(
    run_id: str,
    request: ControlRequest,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict:
    with _RUN_LOCK:
        _authenticate(session, authorization)
        return control_extension_run(session, _get_run(session, run_id), request.action)


@router.post("/jobs/{run_id}/retry-failed")
def retry_extension_job(
    run_id: str,
    request: Confirmation,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> dict:
    with _RUN_LOCK:
        _authenticate(session, authorization)
        run = _get_run(session, run_id)
        if run.runner != "extension":
            raise HTTPException(status_code=409, detail="Run ini bukan batch extension.")
        return _retry_failed(run_id, request, session)


def _claim_next_entry(request: WorkerRequest, session: Session) -> dict | None:
    now = _utcnow()
    _reconcile_expired_claims(session, now)

    owned = session.scalar(select(AutomationRunEntry).join(AutomationRun).where(
        AutomationRun.runner == "extension",
        AutomationRunEntry.status == "processing",
        AutomationRunEntry.claimed_by == request.worker_id,
        AutomationRunEntry.lease_expires_at > now,
    ).order_by(AutomationRun.created_at, AutomationRunEntry.created_at).limit(1))
    if owned:
        run = session.get(AutomationRun, owned.run_id)
        if run.stop_requested or run.pause_requested:
            entry = session.get(LogbookEntry, owned.entry_id)
            if owned.save_attempted:
                _mark_verification_needed(session, run, owned, entry, "Worker aktif kembali setelah jeda atau penghentian dan upaya Simpan sudah tercatat. Periksa portal sebelum melanjutkan.")
            else:
                owned.claimed_by = None
                owned.lease_expires_at = None
                if run.stop_requested:
                    owned.status = "stopped"
                    owned.safe_to_retry = True
                    owned.last_error = "Batch dihentikan sebelum upaya Simpan."
                    if entry and entry.status == "processing":
                        entry.status = "approved"
                else:
                    owned.status = "queued"
                    if entry and entry.status == "processing":
                        entry.status = "approved"
            _refresh_extension_run(session, run)
            session.commit()
            return None
        return _claim_payload(run, owned)

    active_claim = session.scalar(select(AutomationRunEntry.id).join(AutomationRun).where(
        AutomationRun.runner == "extension",
        AutomationRunEntry.status == "processing",
        AutomationRunEntry.lease_expires_at > now,
    ).limit(1))
    if active_claim:
        return None

    item = session.scalar(select(AutomationRunEntry).join(AutomationRun).where(
        AutomationRun.runner == "extension",
        AutomationRun.status.in_({"ready", "running"}),
        AutomationRun.stop_requested.is_(False),
        AutomationRun.pause_requested.is_(False),
        AutomationRunEntry.status == "queued",
        AutomationRunEntry.snapshot_json.is_not(None),
    ).order_by(AutomationRun.created_at, AutomationRunEntry.created_at, AutomationRunEntry.id).limit(1))
    if item is None:
        return None
    try:
        snapshot = json.loads(item.snapshot_json or "")
    except (TypeError, json.JSONDecodeError):
        run = session.get(AutomationRun, item.run_id)
        entry = session.get(LogbookEntry, item.entry_id)
        _mark_verification_needed(session, run, item, entry, "Snapshot batch tidak valid. Periksa entri sebelum melanjutkan.")
        session.commit()
        return None
    if not isinstance(snapshot, dict) or not snapshot:
        run = session.get(AutomationRun, item.run_id)
        entry = session.get(LogbookEntry, item.entry_id)
        _mark_verification_needed(session, run, item, entry, "Snapshot batch tidak valid. Periksa entri sebelum melanjutkan.")
        session.commit()
        return None

    run = session.get(AutomationRun, item.run_id)
    item.status = "processing"
    item.claimed_by = request.worker_id
    item.lease_expires_at = now + CLAIM_TTL
    item.last_error = None
    run.status = "running"
    session.commit()
    return _claim_payload(run, item)


def _reconcile_expired_claims(session: Session, now: datetime) -> None:
    expired = list(session.scalars(select(AutomationRunEntry).join(AutomationRun).where(
        AutomationRun.runner == "extension",
        AutomationRunEntry.status == "processing",
        AutomationRunEntry.lease_expires_at.is_not(None),
        AutomationRunEntry.lease_expires_at <= now,
    )))
    for item in expired:
        run = session.get(AutomationRun, item.run_id)
        entry = session.get(LogbookEntry, item.entry_id)
        item.claimed_by = None
        item.lease_expires_at = None
        if item.save_attempted:
            _mark_verification_needed(session, run, item, entry, "Lease berakhir setelah upaya Simpan. Periksa portal sebelum mencoba ulang.")
        elif run.stop_requested:
            item.status = "stopped"
            item.safe_to_retry = True
            item.last_error = "Batch dihentikan sebelum upaya Simpan."
            if entry and entry.status == "processing":
                entry.status = "approved"
        else:
            item.status = "queued"
            item.last_error = None
        _refresh_extension_run(session, run)
    if expired:
        session.commit()


def _claim_payload(run: AutomationRun, item: AutomationRunEntry) -> dict:
    return {
        "run_id": run.id,
        "run_entry_id": item.id,
        "entry_id": item.entry_id,
        "save_attempted": item.save_attempted,
        "lease_expires_at": item.lease_expires_at.isoformat() if item.lease_expires_at else None,
        "entry": json.loads(item.snapshot_json or "{}"),
    }


def _owned_claim(session: Session, run_id: str, run_entry_id: str, worker_id: str) -> tuple[AutomationRun, AutomationRunEntry]:
    run = _get_run(session, run_id)
    item = session.scalar(select(AutomationRunEntry).where(
        AutomationRunEntry.id == run_entry_id,
        AutomationRunEntry.run_id == run_id,
    ))
    if run.runner != "extension" or item is None or item.status != "processing" or item.claimed_by != worker_id:
        raise HTTPException(status_code=409, detail="Entri tidak sedang diklaim oleh extension ini.")
    return run, item


def _mark_verification_needed(session: Session, run: AutomationRun, item: AutomationRunEntry, entry: LogbookEntry, message: str) -> None:
    item.status = "verification_needed"
    item.safe_to_retry = False
    item.last_error = message
    item.claimed_by = None
    item.lease_expires_at = None
    if entry:
        entry.status = "verification_needed"
        entry.last_error = message
    run.pause_requested = True
    run.last_error = message
    run.status = "paused"


def _local_settings(session: Session) -> LogbookSettings:
    settings = session.get(LogbookSettings, "local")
    if settings is None:
        settings = LogbookSettings(id="local")
        session.add(settings)
        session.flush()
    return settings


def _authenticate(session: Session, authorization: str | None) -> LogbookSettings:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Extension belum dipasangkan.", headers={"WWW-Authenticate": "Bearer"})
    settings = session.get(LogbookSettings, "local")
    token = authorization.removeprefix("Bearer ").strip()
    if not settings or not settings.extension_token_hash or not token or not hmac.compare_digest(settings.extension_token_hash, _digest(token)):
        raise HTTPException(status_code=401, detail="Kredensial extension tidak valid.", headers={"WWW-Authenticate": "Bearer"})
    return settings


def _digest(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _same_outcome(status: str, outcome: str) -> bool:
    return (status, outcome) in {
        ("submitted", "success"),
        ("submitted", "already_present"),
        ("failed", "failed"),
        ("skipped", "skipped"),
        ("verification_needed", "failed"),
        ("verification_needed", "skipped"),
        ("verification_needed", "unknown"),
        ("queued", "paused"),
        ("stopped", "stopped"),
    }
