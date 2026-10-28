from collections import Counter
from datetime import date
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import LogbookEntry
from app.services.reflection_service import get_week_reflection


def preview_automation(session: Session, start: date, end: date) -> dict:
    if start > end:
        raise ValueError("Tanggal mulai harus sama dengan atau sebelum tanggal akhir.")

    entries = list(session.scalars(
        select(LogbookEntry)
        .where(LogbookEntry.date.between(start, end))
        .order_by(LogbookEntry.date, LogbookEntry.created_at, LogbookEntry.id)
    ))
    duplicate_keys = Counter(
        (entry.date, " ".join((entry.activity_text or "").split()).casefold())
        for entry in entries
        if (entry.activity_text or "").strip()
    )
    ready: list[dict] = []
    blocked: list[dict] = []

    for entry in entries:
        reasons = _entry_reasons(session, entry)
        activity_key = (entry.date, " ".join((entry.activity_text or "").split()).casefold())
        if duplicate_keys[activity_key] > 1:
            reasons.append("Entri duplikat: uraian sama muncul lebih dari sekali pada tanggal ini.")
        payload = {"entry_id": entry.id, "date": entry.date.isoformat()}
        if reasons:
            blocked.append({**payload, "reasons": reasons})
        else:
            ready.append(payload)

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "ready_count": len(ready),
        "blocked_count": len(blocked),
        "ready": ready,
        "blocked": blocked,
    }


def _entry_reasons(session: Session, entry: LogbookEntry) -> list[str]:
    reasons: list[str] = []
    if entry.status != "approved" or not entry.entry_approved:
        reasons.append("Entri belum disetujui.")
    if entry.source_conflict:
        reasons.append("Perubahan pada dokumen sumber belum ditinjau.")
    if entry.status in {"processing", "submitted", "verification_needed", "skipped"}:
        reasons.append("Entri sudah diproses atau perlu diperiksa sebelum dicoba lagi.")
    if not (entry.activity_text or "").strip():
        reasons.append("Uraian kegiatan belum diisi.")
    if not (entry.result_text or "").strip():
        reasons.append("Hasil belum diisi.")
    if entry.start_time is None or entry.end_time is None:
        reasons.append("Jam mulai dan selesai belum lengkap.")
    elif entry.start_time >= entry.end_time:
        reasons.append("Jam selesai harus setelah jam mulai.")
    documentation = urlsplit(entry.documentation_url or "")
    if documentation.scheme != "https" or not documentation.netloc:
        reasons.append("Tautan dokumentasi HTTPS belum diisi atau tidak valid.")
    if entry.date.weekday() == 4:
        reflection = get_week_reflection(session, entry.date)
        if not reflection["approved"] or not reflection["reflection_text"].strip():
            reasons.append("Refleksi minggu ini belum disetujui atau sudah kedaluwarsa.")
    return reasons
