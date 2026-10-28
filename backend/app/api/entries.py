from datetime import date, time
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import LogbookEntry, LogbookSettings
from app.db.session import get_db


router = APIRouter(prefix="/entries", tags=["Logbook entries"])


class DateRange(BaseModel):
    start: date
    end: date

    @model_validator(mode="after")
    def validate_range(self):
        if self.start > self.end:
            raise ValueError("Tanggal mulai harus sama dengan atau sebelum tanggal akhir.")
        return self


class EntryPatch(BaseModel):
    activity_text: str | None = Field(default=None, max_length=10000)
    result_text: str | None = Field(default=None, max_length=5000)
    obstacle_text: str | None = Field(default=None, max_length=5000)
    start_time: time | None = None
    end_time: time | None = None
    documentation_url: str | None = Field(default=None, max_length=2048)
    source_reviewed: bool = False

    @model_validator(mode="after")
    def validate_times(self):
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.start_time >= self.end_time
        ):
            raise ValueError("Jam selesai harus setelah jam mulai.")
        return self


class DefaultHours(BaseModel):
    default_start_time: time | None = None
    default_end_time: time | None = None

    @model_validator(mode="after")
    def validate_hours(self):
        if (self.default_start_time is None) != (self.default_end_time is None):
            raise ValueError("Isi kedua jam atau kosongkan keduanya.")
        if (
            self.default_start_time is not None
            and self.default_end_time is not None
            and self.default_start_time >= self.default_end_time
        ):
            raise ValueError("Jam selesai harus setelah jam mulai.")
        return self


class ApplyDefaultHours(DateRange):
    confirmed: bool


@router.get("")
def list_entries(start: date, end: date, session: Session = Depends(get_db)) -> list[dict]:
    _validate_range(start, end)
    entries = session.scalars(
        select(LogbookEntry)
        .where(LogbookEntry.date.between(start, end))
        .order_by(LogbookEntry.date, LogbookEntry.created_at)
    )
    return [_entry_payload(entry) for entry in entries]


@router.patch("/{entry_id}")
def update_entry(
    entry_id: str,
    update: EntryPatch,
    session: Session = Depends(get_db),
) -> dict:
    entry = _find_entry(session, entry_id)
    if entry.status in {"processing", "submitted", "verification_needed"} or entry.portal_entry_id:
        raise HTTPException(status_code=409, detail="Catatan yang sudah dikirim tidak dapat diubah di sini.")
    if entry.status == "skipped":
        raise HTTPException(status_code=409, detail="Catatan izin/sakit tidak dapat disetujui sebagai entri kerja.")

    changes = update.model_dump(exclude_unset=True, exclude={"source_reviewed"})
    if "documentation_url" in changes:
        changes["documentation_url"] = _validate_documentation_url(changes["documentation_url"])
    if "start_time" in changes or "end_time" in changes:
        start_time = changes.get("start_time", entry.start_time)
        end_time = changes.get("end_time", entry.end_time)
        if (start_time is None) != (end_time is None):
            raise HTTPException(status_code=422, detail="Isi jam mulai dan jam selesai bersama-sama.")
        if start_time is not None and start_time >= end_time:
            raise HTTPException(status_code=422, detail="Jam selesai harus setelah jam mulai.")

    changed = any(getattr(entry, key) != value for key, value in changes.items())
    for key, value in changes.items():
        setattr(entry, key, value)

    reviewed_source = update.source_reviewed and entry.source_conflict
    if reviewed_source:
        entry.source_conflict = False
    if changed or reviewed_source:
        entry.entry_approved = False
        entry.reflection_approved = False
        entry.status = (
            "draft"
            if not entry.source_conflict and (entry.activity_text or "").strip()
            else "needs_review"
        )
        entry.last_error = None

    session.commit()
    session.refresh(entry)
    return _entry_payload(entry)


@router.post("/{entry_id}/approve")
def approve_entry(entry_id: str, session: Session = Depends(get_db)) -> dict:
    entry = _find_entry(session, entry_id)
    if entry.status == "skipped":
        raise HTTPException(status_code=409, detail="Catatan izin/sakit tidak masuk entri kerja biasa.")
    if entry.source_conflict:
        raise HTTPException(status_code=409, detail="Tinjau perubahan sumber dan simpan catatan sebelum menyetujui.")
    if not (entry.activity_text or "").strip():
        raise HTTPException(status_code=422, detail="Uraian kegiatan perlu diisi sebelum disetujui.")
    if entry.start_time is None or entry.end_time is None:
        raise HTTPException(status_code=422, detail="Isi jam mulai dan jam selesai sebelum menyetujui.")
    if entry.start_time >= entry.end_time:
        raise HTTPException(status_code=422, detail="Jam selesai harus setelah jam mulai.")
    if entry.status not in {"draft", "approved"}:
        raise HTTPException(status_code=409, detail="Tinjau dan lengkapi catatan sebelum menyetujui.")

    entry.entry_approved = True
    entry.status = "approved"
    entry.last_error = None
    session.commit()
    session.refresh(entry)
    return _entry_payload(entry)


@router.get("/default-hours")
def get_default_hours(session: Session = Depends(get_db)) -> dict:
    settings = session.get(LogbookSettings, "local")
    return _hours_payload(settings)


@router.put("/default-hours")
def save_default_hours(hours: DefaultHours, session: Session = Depends(get_db)) -> dict:
    settings = session.get(LogbookSettings, "local")
    if settings is None:
        settings = LogbookSettings(id="local")
        session.add(settings)
    settings.default_start_time = hours.default_start_time
    settings.default_end_time = hours.default_end_time
    session.commit()
    session.refresh(settings)
    return _hours_payload(settings)


@router.post("/default-hours/apply")
def apply_default_hours(
    request: ApplyDefaultHours,
    session: Session = Depends(get_db),
) -> dict[str, int]:
    _validate_range(request.start, request.end)
    if not request.confirmed:
        raise HTTPException(status_code=422, detail="Konfirmasi penerapan jam diperlukan.")

    settings = session.get(LogbookSettings, "local")
    if not settings or settings.default_start_time is None or settings.default_end_time is None:
        raise HTTPException(status_code=409, detail="Simpan jam kerja bawaan terlebih dahulu.")

    entries = session.scalars(
        select(LogbookEntry).where(
            LogbookEntry.date.between(request.start, request.end),
            LogbookEntry.status == "draft",
            LogbookEntry.entry_approved.is_(False),
            LogbookEntry.source_conflict.is_(False),
            LogbookEntry.start_time.is_(None),
            LogbookEntry.end_time.is_(None),
        )
    )
    updated = 0
    for entry in entries:
        if not (entry.activity_text or entry.original_activity or "").strip():
            continue
        entry.start_time = settings.default_start_time
        entry.end_time = settings.default_end_time
        updated += 1

    session.commit()
    return {"updated": updated}


def _validate_range(start: date, end: date) -> None:
    if start > end:
        raise HTTPException(status_code=422, detail="Tanggal mulai harus sama dengan atau sebelum tanggal akhir.")


def _find_entry(session: Session, entry_id: str) -> LogbookEntry:
    entry = session.get(LogbookEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Catatan logbook tidak ditemukan.")
    return entry


def _validate_documentation_url(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    candidate = value.strip()
    parsed = urlsplit(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=422, detail="Dokumentasi harus berupa tautan http atau https.")
    return candidate


def _entry_payload(entry: LogbookEntry) -> dict:
    return {
        "id": entry.id,
        "date": entry.date.isoformat(),
        "week_number": entry.week_number,
        "original_activity": entry.original_activity,
        "activity_text": entry.activity_text,
        "result_text": entry.result_text,
        "obstacle_text": entry.obstacle_text,
        "start_time": _time_string(entry.start_time),
        "end_time": _time_string(entry.end_time),
        "documentation_url": entry.documentation_url,
        "entry_approved": entry.entry_approved,
        "source_conflict": entry.source_conflict,
        "status": entry.status,
    }


def _hours_payload(settings: LogbookSettings | None) -> dict:
    return {
        "default_start_time": _time_string(settings.default_start_time) if settings else None,
        "default_end_time": _time_string(settings.default_end_time) if settings else None,
    }


def _time_string(value: time | None) -> str | None:
    return value.isoformat(timespec="minutes") if value else None
